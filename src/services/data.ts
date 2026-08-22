import { Cafe, CafeHours, CafeImage, StudyEnvironmentRating } from '../types';
import { supabase } from './supabase';

/**
 * Helper to generate public URL for a file in the 'cafe-images' Supabase Storage bucket.
 */
export function getCafeImageUrl(storagePath: string): string {
  if (!storagePath) return '';
  const { data } = supabase.storage.from('cafe-images').getPublicUrl(storagePath);
  return data?.publicUrl || '';
}

/**
 * Fetch all images for a specific café from cafe_images table,
 * sorted by display_order ascending (display_order = 0 is main image).
 */
export async function getCafeImages(cafeId: string): Promise<CafeImage[]> {
  try {
    const { data, error } = await supabase
      .from('cafe_images')
      .select('*')
      .eq('cafe_id', cafeId)
      .order('display_order', { ascending: true });

    if (error) {
      console.warn(`Note on fetching images for cafe ${cafeId}:`, error.message);
      return [];
    }

    return (data || []).map((img: CafeImage) => ({
      ...img,
      public_url: img.storage_path ? getCafeImageUrl(img.storage_path) : undefined,
    }));
  } catch (err) {
    console.warn(`Unexpected error fetching images for cafe ${cafeId}:`, err);
    return [];
  }
}

/**
 * Fetch all cafes (attempts Supabase select on v_cafes_with_ratings)
 * and resolves main images from cafe_images table / cafe-images Storage bucket.
 */
export async function getCafes(): Promise<Cafe[]> {
  const { data, error } = await supabase
    .from('v_cafes_with_ratings')
    .select('*');

  if (error) {
    console.error('Error fetching cafes from Supabase:', error.message);
    throw new Error(error.message);
  }

  const cafes = (data || []) as Cafe[];

  // Batch attempt to resolve main image (display_order = 0) for each cafe
  try {
    const { data: imagesData, error: imagesError } = await supabase
      .from('cafe_images')
      .select('cafe_id, storage_path, display_order')
      .order('display_order', { ascending: true });

    if (imagesError) {
      console.warn('Note on fetching cafe_images from Supabase:', imagesError.message);
    } else if (imagesData && imagesData.length > 0) {
      const mainImagesMap: Record<string, string> = {};
      
      // Since sorted by display_order ASC, the first entry per cafe_id is display_order = 0 (or lowest order)
      imagesData.forEach((img: { cafe_id: string; storage_path: string; display_order: number }) => {
        if (!mainImagesMap[img.cafe_id] && img.storage_path) {
          const publicUrl = getCafeImageUrl(img.storage_path);
          if (publicUrl) {
            mainImagesMap[img.cafe_id] = publicUrl;
          }
        }
      });

      cafes.forEach((cafe) => {
        if (mainImagesMap[cafe.id]) {
          cafe.image_url = mainImagesMap[cafe.id];
        }
      });
    }
  } catch (imgErr) {
    console.warn('Could not resolve cafe storage images (falling back to default URLs/placeholders):', imgErr);
  }

  return cafes;
}

/**
 * Fetch operating hours for a specific cafe
 */
export async function getCafeHours(cafeId: string): Promise<CafeHours[]> {
  const { data, error } = await supabase
    .from('cafe_hours')
    .select('*')
    .eq('cafe_id', cafeId);

  if (error) {
    console.error(`Error fetching hours for cafe ${cafeId}:`, error.message);
    throw new Error(error.message);
  }

  return (data || []) as CafeHours[];
}

/**
 * Fetch operating hours in bulk for a list of cafes
 */
export async function getCafeHoursBatch(cafeIds: string[]): Promise<Record<string, CafeHours[]>> {
  const { data, error } = await supabase
    .from('cafe_hours')
    .select('*')
    .in('cafe_id', cafeIds);

  if (error) {
    console.error('Error fetching batch hours:', error.message);
    throw new Error(error.message);
  }

  const hoursMap: Record<string, CafeHours[]> = {};
  data?.forEach((h: CafeHours) => {
    if (!hoursMap[h.cafe_id]) {
      hoursMap[h.cafe_id] = [];
    }
    hoursMap[h.cafe_id].push(h);
  });

  return hoursMap;
}

/**
 * Submit environment rating for a cafe (updates or inserts)
 */
export async function submitRating(
  cafeId: string,
  userId: string,
  quietnessRating: number,
  aestheticsRating: number
): Promise<void> {
  const { error } = await supabase
    .from('study_environment_ratings')
    .upsert(
      {
        cafe_id: cafeId,
        user_id: userId,
        quietness_rating: quietnessRating,
        aesthetics_rating: aestheticsRating,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,cafe_id' }
    );

  if (error) {
    console.error('Supabase rating submit failed:', error.message);
    throw new Error(error.message);
  }
}

/**
 * Fetch favorite cafe IDs for a user
 */
export async function getFavorites(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('favorites')
    .select('cafe_id')
    .eq('user_id', userId);

  if (error) {
    console.error('Error fetching favorites:', error.message);
    throw new Error(error.message);
  }

  return data?.map((f) => f.cafe_id) || [];
}

/**
 * Toggle favorite status
 */
export async function toggleFavorite(userId: string, cafeId: string, isFav: boolean): Promise<void> {
  if (isFav) {
    const { error } = await supabase
      .from('favorites')
      .insert({ user_id: userId, cafe_id: cafeId });
    if (error) {
      console.error('Error adding favorite:', error.message);
      throw new Error(error.message);
    }
  } else {
    const { error } = await supabase
      .from('favorites')
      .delete()
      .eq('user_id', userId)
      .eq('cafe_id', cafeId);
    if (error) {
      console.error('Error removing favorite:', error.message);
      throw new Error(error.message);
    }
  }
}
