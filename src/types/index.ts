export type CrowdLevel = 'Low' | 'Moderate' | 'Busy' | 'Full';
export type WifiQuality = 'Poor' | 'Good' | 'Excellent';

export interface Cafe {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  wifi_available: boolean;
  wifi_quality: WifiQuality | null;
  image_url: string | null;
  created_at: string;
  updated_at: string;
  
  // From the public.v_cafes_with_ratings database view
  avg_quietness?: number;
  avg_aesthetics?: number;
  total_ratings?: number;
  current_crowd_level?: CrowdLevel | null;
  crowd_updated_at?: string | null;
}

export interface CafeImage {
  id?: string;
  cafe_id: string;
  storage_path: string;
  display_order: number;
  created_at?: string;
  public_url?: string;
}

export interface CafeHours {
  id: string;
  cafe_id: string;
  day_of_week: number; // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  opening_time: string; // HH:MM:SS format
  closing_time: string; // HH:MM:SS format
}

export interface CafeCrowdStatus {
  id: string;
  cafe_id: string;
  crowd_level: CrowdLevel;
  updated_at: string;
  updated_by: string | null;
}

export interface StudyEnvironmentRating {
  id: string;
  cafe_id: string;
  user_id: string;
  quietness_rating: number; // 1 = Loud, 2 = Moderate, 3 = Quiet
  aesthetics_rating: number; // 1 - 5 stars
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  display_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  phone_number?: string | null;
  created_at?: string;
  updated_at?: string | null;
}

export interface LocationState {
  latitude: number;
  longitude: number;
  isFallback: boolean;
  permissionGranted: boolean;
}

export type AssistantIntent = 'general_chat' | 'recommend_cafe' | 'modify_recommendation';

export interface StructuredPreferences {
  intent?: AssistantIntent;
  max_results?: number;
  max_distance?: number;
  distance_unit?: 'miles' | 'minutes';
  wifi_required?: boolean;
  preferred_crowd_levels?: CrowdLevel[];
  quietness?: 'Loud' | 'Moderate' | 'Quiet';
  aesthetics_priority?: 'Low' | 'Medium' | 'High';
  open_now?: boolean;
  sort_by?: 'distance' | 'crowd' | 'quietness' | 'aesthetics' | 'rating' | 'default';
}

export interface RecommendationResult {
  cafe: Cafe;
  score: number;
  reasons: string[];
}
