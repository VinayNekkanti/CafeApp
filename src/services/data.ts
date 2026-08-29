import { Cafe, CafeHours, CafeImage, StudyEnvironmentRating, CafeReview, CafeEmployee } from '../types';
import { supabase } from './supabase';

/**
 * Helper to generate public URL for a file in the 'cafe-images' Supabase Storage bucket.
 */
export function getCafeImageUrl(storagePath: string): string {
  if (!storagePath) return '';
  if (storagePath.startsWith('http://') || storagePath.startsWith('https://')) {
    return storagePath;
  }

  // Clean leading slash or bucket name duplication
  let cleanPath = storagePath.startsWith('/') ? storagePath.slice(1) : storagePath;
  if (cleanPath.startsWith('cafe-images/')) {
    cleanPath = cleanPath.slice('cafe-images/'.length);
  }

  const { data } = supabase.storage.from('cafe-images').getPublicUrl(cleanPath);
  const publicUrl = data?.publicUrl || '';
  return publicUrl;
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

    console.log('[DEBUG getCafes] fetched cafe_images rows:', imagesData, 'error:', imagesError);

    if (imagesError) {
      console.warn('Note on fetching cafe_images from Supabase:', imagesError.message);
    } else if (imagesData && imagesData.length > 0) {
      const mainImagesMap: Record<string, string> = {};
      
      // Prioritize display_order = 0 or lowest display_order
      imagesData.forEach((img: { cafe_id: string; storage_path: string; display_order: number }) => {
        if ((img.display_order === 0 || !mainImagesMap[img.cafe_id]) && img.storage_path) {
          const publicUrl = getCafeImageUrl(img.storage_path);
          if (publicUrl) {
            mainImagesMap[img.cafe_id] = publicUrl;
          }
        }
      });

      console.log('[DEBUG getCafes] mainImagesMap:', mainImagesMap);

      cafes.forEach((cafe) => {
        if (mainImagesMap[cafe.id]) {
          cafe.image_url = mainImagesMap[cafe.id];
        }
      });
    }
  } catch (imgErr) {
    console.warn('Could not resolve cafe storage images (falling back to default URLs/placeholders):', imgErr);
  }

  const gridCafe = cafes.find(c => c.name.toLowerCase().includes('grid'));
  if (gridCafe) {
    console.log('[DEBUG Grid Cafe] Final resolved cafe object:', {
      id: gridCafe.id,
      name: gridCafe.name,
      image_url: gridCafe.image_url
    });
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
    console.error('[Favorites Debug] Error fetching favorites:', error.message);
    throw new Error(error.message);
  }

  return data?.map((f) => f.cafe_id) || [];
}

/**
 * Toggle favorite status
 */
export async function toggleFavorite(userId: string, cafeId: string, shouldFavorite: boolean): Promise<void> {
  // Verify authenticated user from Supabase Auth at submit time
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    console.error('[Favorites Debug] Auth check failed at toggle time:', authError);
    throw new Error('You must be signed in to save favorite spots.');
  }

  const activeUserId = user.id;
  console.log(`[Favorites Debug] User UUID: ${activeUserId}, Cafe UUID: ${cafeId}, Action: ${shouldFavorite ? 'INSERT' : 'DELETE'}`);

  if (shouldFavorite) {
    const { error } = await supabase
      .from('favorites')
      .insert({ user_id: activeUserId, cafe_id: cafeId });

    if (error) {
      console.error('[Favorites Debug] Error adding favorite:', error.message);
      throw new Error(error.message);
    }
  } else {
    const { error } = await supabase
      .from('favorites')
      .delete()
      .eq('user_id', activeUserId)
      .eq('cafe_id', cafeId);

    if (error) {
      console.error('[Favorites Debug] Error removing favorite:', error.message);
      throw new Error(error.message);
    }
  }
}

/**
 * Submit a free-text review for a cafe
 */
export async function submitCafeReview(cafeId: string, reviewText: string): Promise<void> {
  const cleanText = reviewText.trim();
  if (!cleanText) {
    throw new Error('Review text cannot be empty.');
  }

  // Verify authenticated user at submit time directly from Supabase Auth
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    console.error('[RLS Debug] Authentication check failed at submit time:', authError);
    throw new Error('You must be signed in to submit a review.');
  }

  // Enforce 2-reviews per user per day limit
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { count, error: countError } = await supabase
    .from('cafe_reviews')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .gte('created_at', todayStart.toISOString());

  if (!countError && count !== null && count >= 2) {
    throw new Error('Daily review limit reached. You can submit up to 2 reviews per day.');
  }

  const { error } = await supabase
    .from('cafe_reviews')
    .insert({
      cafe_id: cafeId,
      user_id: user.id,
      review_text: cleanText,
    });

  if (error) {
    console.error('Supabase submitCafeReview failed:', error.message);
    throw new Error(error.message);
  }
}

/**
 * Fetch publicly visible reviews for a specific café, returning initial 20 items and exact total count
 */
export async function getCafeReviews(cafeId: string): Promise<{ reviews: CafeReview[]; totalCount: number }> {
  try {
    const { data, count, error } = await supabase
      .from('v_public_cafe_reviews')
      .select('*', { count: 'exact' })
      .eq('cafe_id', cafeId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      console.warn(`Note on fetching reviews for cafe ${cafeId}:`, error.message);
      return { reviews: [], totalCount: 0 };
    }

    const reviews = (data || []).map((row: any) => ({
      id: row.id,
      cafe_id: row.cafe_id,
      user_id: '',
      review_text: row.review_text,
      created_at: row.created_at,
      updated_at: row.updated_at,
      user_display_name: row.safe_author_name || 'Anonymous Student',
    }));

    return {
      reviews,
      totalCount: count ?? reviews.length,
    };
  } catch (err) {
    console.warn(`Unexpected error fetching reviews for cafe ${cafeId}:`, err);
    return { reviews: [], totalCount: 0 };
  }
}

/**
 * Fetch employee mapping for currently authenticated user
 */
export async function getEmployeeAssignment(): Promise<CafeEmployee | null> {
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return null;
  }

  const { data, error } = await supabase
    .from('cafe_employees')
    .select('*, cafes(name)')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    console.error('[Employee Debug] Error checking employee assignment:', error.message);
    return null;
  }

  if (!data) return null;

  return {
    id: data.id,
    user_id: data.user_id,
    cafe_id: data.cafe_id,
    is_active: data.is_active,
    created_at: data.created_at,
    cafe_name: data.cafes?.name || 'Assigned Café',
  };
}

/**
 * Submit crowd level update for employee's assigned café (1–10 integer)
 */
export async function submitEmployeeCrowdLevel(newLevel: number): Promise<{ success: boolean; cafe_name: string; crowd_level: number }> {
  if (newLevel < 1 || newLevel > 10) {
    throw new Error('Crowd level must be between 1 and 10.');
  }

  const { data, error } = await supabase.rpc('update_employee_crowd_level', {
    new_level: Math.round(newLevel),
  });

  if (error) {
    console.error('[Employee Debug] RPC update_employee_crowd_level failed:', error.message);
    throw new Error(error.message || 'Unable to update crowd level. Please try again.');
  }

  return data;
}
