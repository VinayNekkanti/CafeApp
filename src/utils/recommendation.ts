import { Cafe, CafeHours, CrowdLevel, RecommendationResult, StructuredPreferences } from '../types';
import { calculateDistance } from './distance';
import { getOpenStatus } from './hours';

const DEFAULT_WEIGHTS = {
  distance: 0.25,
  crowdLevel: 0.20,
  quietness: 0.20,
  aesthetics: 0.15,
  wifi: 0.10,
  openNow: 0.10,
};

/**
 * Recommendations generator: retrieves and ranks cafes based on weights and preferences.
 */
export function rankCafes(
  cafes: Cafe[],
  allHours: Record<string, CafeHours[]>,
  userLat: number,
  userLon: number,
  prefs?: StructuredPreferences
): RecommendationResult[] {
  const scoredCafes = cafes
    .map((cafe) => {
      const cafeHours = allHours[cafe.id] || [];
      const scoreResult = calculateCafeScore(cafe, cafeHours, userLat, userLon, prefs);
      
      return {
        cafe,
        score: scoreResult.score,
        reasons: scoreResult.reasons,
        excluded: scoreResult.excluded,
        distanceMiles: calculateDistance(userLat, userLon, cafe.latitude, cafe.longitude),
      };
    })
    .filter((result) => !result.excluded);

  // Sorting logic based on prefs.sort_by
  scoredCafes.sort((a, b) => {
    if (prefs?.sort_by === 'distance') {
      return a.distanceMiles - b.distanceMiles;
    }
    if (prefs?.sort_by === 'crowd') {
      const crowdRank: Record<string, number> = { Low: 1, Moderate: 2, Busy: 3, Full: 4 };
      const rankA = crowdRank[a.cafe.current_crowd_level || 'Low'] || 1;
      const rankB = crowdRank[b.cafe.current_crowd_level || 'Low'] || 1;
      if (rankA !== rankB) return rankA - rankB;
    }
    if (prefs?.sort_by === 'quietness') {
      const quietA = Number(a.cafe.avg_quietness) || 0;
      const quietB = Number(b.cafe.avg_quietness) || 0;
      if (quietA !== quietB) return quietB - quietA;
    }
    return b.score - a.score;
  });

  const resultCount = Math.min(Math.max(prefs?.max_results ?? 3, 1), 3);

  return scoredCafes
    .slice(0, resultCount)
    .map(({ cafe, score, reasons }) => ({ cafe, score, reasons }));
}

interface ScoreBreakdown {
  score: number;
  reasons: string[];
  excluded: boolean;
}

function calculateCafeScore(
  cafe: Cafe,
  hours: CafeHours[],
  userLat: number,
  userLon: number,
  prefs?: StructuredPreferences
): ScoreBreakdown {
  const reasons: string[] = [];
  let excluded = false;

  // 1. HARD FILTERS
  // Wi-Fi requirement
  if (prefs?.wifi_required && !cafe.wifi_available) {
    excluded = true;
    reasons.push('Excluded: Requires Wi-Fi, but none is available.');
  }

  if (excluded) {
    return { score: 0, reasons, excluded: true };
  }

  // 2. DYNAMIC WEIGHT ADJUSTMENTS
  let weights = { ...DEFAULT_WEIGHTS };

  if (prefs) {
    // If user indicates distance preferences, adjust weighting
    if (prefs.max_distance === 0) {
      weights.distance = 0;
      // Re-distribute distance weight (0.25) to others proportionately
      const sumOthers = 1 - DEFAULT_WEIGHTS.distance;
      weights.crowdLevel += (DEFAULT_WEIGHTS.crowdLevel / sumOthers) * DEFAULT_WEIGHTS.distance;
      weights.quietness += (DEFAULT_WEIGHTS.quietness / sumOthers) * DEFAULT_WEIGHTS.distance;
      weights.aesthetics += (DEFAULT_WEIGHTS.aesthetics / sumOthers) * DEFAULT_WEIGHTS.distance;
      weights.wifi += (DEFAULT_WEIGHTS.wifi / sumOthers) * DEFAULT_WEIGHTS.distance;
      weights.openNow += (DEFAULT_WEIGHTS.openNow / sumOthers) * DEFAULT_WEIGHTS.distance;
    }
  }

  // Normalize weights just in case
  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
  if (totalWeight > 0) {
    Object.keys(weights).forEach((key) => {
      weights[key as keyof typeof weights] /= totalWeight;
    });
  }

  // 3. DIMENSION SCORING

  // A. Distance (Max 100 points)
  const distanceMiles = calculateDistance(userLat, userLon, cafe.latitude, cafe.longitude);
  let distanceScore = 0;
  if (distanceMiles <= 0.2) {
    distanceScore = 100;
  } else if (distanceMiles <= 5.0) {
    // Linear decay from 0.2 to 5 miles
    distanceScore = 100 - ((distanceMiles - 0.2) / 4.8) * 100;
  } else {
    distanceScore = 0;
  }

  // If user requested a max distance, penalize or filter if they exceed it
  if (prefs?.max_distance) {
    const limit = prefs.max_distance;
    const isMinutes = prefs.distance_unit === 'minutes';
    // Assume walking speed 20 mins per mile
    const cafeDistanceMetric = isMinutes ? distanceMiles * 20 : distanceMiles;
    
    if (cafeDistanceMetric > limit) {
      // Exceeds distance preference
      distanceScore *= 0.2; // severe penalty
      reasons.push(`Further than preferred ${limit} ${isMinutes ? 'mins' : 'miles'} away.`);
    } else {
      reasons.push(`Conveniently located within your preferred distance.`);
    }
  } else if (distanceMiles <= 0.5) {
    reasons.push('Extremely close to your location.');
  }

  // B. Crowd Level (Max 100 points)
  const crowd = cafe.current_crowd_level;
  let crowdScore = 50; // default neutral
  if (crowd === 'Low') crowdScore = 100;
  else if (crowd === 'Moderate') crowdScore = 75;
  else if (crowd === 'Busy') crowdScore = 35;
  else if (crowd === 'Full') crowdScore = 5;

  if (prefs?.preferred_crowd_levels && prefs.preferred_crowd_levels.length > 0) {
    if (crowd && prefs.preferred_crowd_levels.includes(crowd)) {
      crowdScore = 100;
      reasons.push(`Matches preferred crowd level (${crowd}).`);
    } else if (crowd) {
      crowdScore = 10; // penalty for mismatch
      reasons.push(`Busy status is currently: ${crowd}.`);
    }
  } else if (crowd === 'Low' || crowd === 'Moderate') {
    reasons.push(`Not crowded (Status: ${crowd}).`);
  }

  // C. Quietness (Max 100 points)
  const avgQuiet = Number(cafe.avg_quietness) || 0;
  let quietScore = 50;
  if (avgQuiet > 0) {
    // scale 1-3 to 0-100
    quietScore = ((avgQuiet - 1) / 2) * 100;
  }

  if (prefs?.quietness) {
    const prefQuiet = prefs.quietness; // 'Quiet' | 'Moderate' | 'Loud'
    const targetVal = prefQuiet === 'Quiet' ? 3 : prefQuiet === 'Moderate' ? 2 : 1;
    if (avgQuiet > 0) {
      const diff = Math.abs(avgQuiet - targetVal);
      quietScore = Math.max(0, 100 - diff * 50);
      if (avgQuiet >= 2.3 && prefQuiet === 'Quiet') {
        reasons.push('Highly rated for its quiet study environment.');
      }
    } else {
      // Neutral if no ratings
      quietScore = 50;
    }
  } else if (avgQuiet >= 2.4) {
    reasons.push('Usually quiet and peaceful.');
  }

  // D. Aesthetics (Max 100 points)
  const avgAes = Number(cafe.avg_aesthetics) || 0;
  let aesScore = 50;
  if (avgAes > 0) {
    // scale 1-5 to 0-100
    aesScore = ((avgAes - 1) / 4) * 100;
  }

  if (prefs?.aesthetics_priority === 'High') {
    if (avgAes >= 4.0) {
      aesScore = 100;
      reasons.push('Stunning cafe aesthetic matching your taste.');
    } else if (avgAes > 0 && avgAes < 3.5) {
      aesScore *= 0.5; // penalize if poor aesthetic
    }
  } else if (avgAes >= 4.3) {
    reasons.push('Highly rated study vibe and aesthetics.');
  }

  // E. Wi-Fi (Max 100 points)
  let wifiScore = 0;
  if (cafe.wifi_available) {
    const qual = cafe.wifi_quality;
    if (qual === 'Excellent') wifiScore = 100;
    else if (qual === 'Good') wifiScore = 80;
    else if (qual === 'Poor') wifiScore = 40;
    else wifiScore = 70; // fallback if quality is null but wifi is available
  }

  if (cafe.wifi_available) {
    reasons.push(`Offers ${cafe.wifi_quality ? cafe.wifi_quality : 'standard'} Wi-Fi connection.`);
  }

  // F. Open Now (Max 100 points)
  const openStatus = getOpenStatus(hours);
  const openScore = openStatus.isOpen ? 100 : 0;
  if (openStatus.isOpen) {
    reasons.push('Currently open.');
  } else {
    reasons.push('Currently closed.');
  }

  // 4. AGGREGATE FINAL SCORE
  const finalScore =
    distanceScore * weights.distance +
    crowdScore * weights.crowdLevel +
    quietScore * weights.quietness +
    aesScore * weights.aesthetics +
    wifiScore * weights.wifi +
    openScore * weights.openNow;

  return {
    score: Math.round(finalScore),
    reasons: reasons.slice(0, 3), // return top 3 reasons for clean UI display
    excluded: false,
  };
}
