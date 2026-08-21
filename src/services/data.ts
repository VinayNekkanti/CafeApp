import { Cafe, CafeHours, StudyEnvironmentRating } from '../types';
import { supabase } from './supabase';



/**
 * Fetch all cafes (attempts Supabase select on v_cafes_with_ratings)
 */
export async function getCafes(): Promise<Cafe[]> {
  const { data, error } = await supabase
    .from('v_cafes_with_ratings')
    .select('*');

  if (error) {
    console.error('Error fetching cafes from Supabase:', error.message);
    throw new Error(error.message);
  }

  return (data || []) as Cafe[];
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
