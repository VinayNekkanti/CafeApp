import React, { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { useRouter } from 'expo-router';
import { Cafe, CafeHours } from '../types';
import { THEME } from '../constants/theme';
import { calculateDistance, formatDistance, estimateWalkingTime } from '../utils/distance';
import { openCafeDirections } from '../utils/directions';
import { getOpenStatus } from '../utils/hours';
import { formatCrowdUpdatedAt } from '../utils/time';
import Ionicons from '@expo/vector-icons/Ionicons';

interface CafeCardProps {
  cafe: Cafe;
  hours: CafeHours[];
  userLat: number;
  userLon: number;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  onPress: () => void;
}

export const CafeCard: React.FC<CafeCardProps> = ({
  cafe,
  hours,
  userLat,
  userLon,
  isFavorite = false,
  onToggleFavorite,
  onPress,
}) => {
  const router = useRouter();
  const colorScheme = (useColorScheme() ?? 'light') as 'light' | 'dark';
  const themeColors = THEME.colors[colorScheme];

  // Calculate distance
  const distanceMiles = calculateDistance(userLat, userLon, cafe.latitude, cafe.longitude);
  const distanceStr = formatDistance(distanceMiles);
  const walkingMins = estimateWalkingTime(distanceMiles);

  // Calculate Open/Closed Status
  const openStatus = getOpenStatus(hours);

  // Get Crowd badge details
  const getCrowdBadeInfo = () => {
    const crowd = cafe.current_crowd_level || 'Low';
    let text = String(crowd);
    let bgColor = themeColors.successLight;
    let textColor = themeColors.success;

    const parsedNum = parseInt(text, 10);
    if (!isNaN(parsedNum)) {
      text = `${parsedNum}/10`;
      if (parsedNum <= 3) {
        bgColor = themeColors.successLight;
        textColor = themeColors.success;
      } else if (parsedNum <= 6) {
        bgColor = themeColors.warningLight;
        textColor = themeColors.warning;
      } else if (parsedNum <= 8) {
        bgColor = themeColors.accentLight;
        textColor = themeColors.accent;
      } else {
        bgColor = themeColors.dangerLight;
        textColor = themeColors.danger;
      }
    } else {
      if (crowd === 'Moderate') {
        bgColor = themeColors.warningLight;
        textColor = themeColors.warning;
      } else if (crowd === 'Busy') {
        bgColor = themeColors.accentLight;
        textColor = themeColors.accent;
      } else if (crowd === 'Full') {
        bgColor = themeColors.dangerLight;
        textColor = themeColors.danger;
      }
    }

    return { text, bgColor, textColor };
  };

  const crowdInfo = getCrowdBadeInfo();

  // Format crowd update time
  const formatCrowdTime = () => {
    if (!cafe.crowd_updated_at) return 'Update unavailable';
    const diffMs = Date.now() - new Date(cafe.crowd_updated_at).getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'updated just now';
    if (diffMins < 60) return `updated ${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `updated ${diffHours}h ago`;
    return `updated ${Math.floor(diffHours / 24)}d ago`;
  };

  // Format Quietness text
  const getQuietnessText = (avgVal?: number) => {
    const num = avgVal || 0;
    if (num === 0) return 'No ratings';
    if (num <= 1.6) return 'Loud 🔊';
    if (num <= 2.3) return 'Moderate 🔉';
    return 'Quiet 🤫';
  };

  const quietText = getQuietnessText(cafe.avg_quietness);

  const [imageError, setImageError] = useState(false);

  if (cafe.name.toLowerCase().includes('grid')) {
    console.log(`[DEBUG CafeCard] Grid Cafe render:`, {
      id: cafe.id,
      name: cafe.name,
      image_url: cafe.image_url,
      imageError,
    });
  }

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: themeColors.surface,
          borderColor: themeColors.border,
        },
        colorScheme === 'light' ? THEME.shadows.light : THEME.shadows.dark,
        pressed && { opacity: 0.9, transform: [{ scale: 0.99 }] },
      ]}
    >
      {/* Cafe Image */}
      {cafe.image_url && !imageError ? (
        <Image
          source={{ uri: cafe.image_url }}
          style={styles.image}
          onError={(e) => {
            console.error(`[DEBUG CafeCard] Image load failed for ${cafe.name}:`, e.nativeEvent, 'URL:', cafe.image_url);
            setImageError(true);
          }}
        />
      ) : (
        <View style={[styles.placeholderImage, { backgroundColor: themeColors.surfaceMuted }]}>
          <Ionicons name="cafe-outline" size={40} color={themeColors.textLight} />
        </View>
      )}

      {/* Heart Favorite Button on Top Left */}
      {onToggleFavorite && (
        <Pressable
          onPress={(e: any) => {
            if (e) {
              if (typeof e.stopPropagation === 'function') e.stopPropagation();
              if (typeof e.preventDefault === 'function') e.preventDefault();
            }
            console.log('[Favorites Debug] Favorite pressed:', cafe.id, cafe.name);
            onToggleFavorite();
          }}
          style={({ pressed }) => [
            styles.heartOverlayBtn,
            { backgroundColor: 'rgba(0, 0, 0, 0.45)' },
            pressed && { opacity: 0.8 },
          ]}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons
            name={isFavorite ? 'heart' : 'heart-outline'}
            size={18}
            color={isFavorite ? '#EF4444' : '#FFF'}
          />
        </Pressable>
      )}

      {/* Open/Closed Badge on Top Right of Image */}
      <View
        style={[
          styles.statusBadge,
          {
            backgroundColor:
              openStatus.badgeColor === 'success'
                ? themeColors.successLight
                : themeColors.dangerLight,
          },
        ]}
      >
        <Text
          style={[
            styles.statusBadgeText,
            {
              color:
                openStatus.badgeColor === 'success'
                  ? themeColors.success
                  : themeColors.danger,
            },
          ]}
        >
          {openStatus.isOpen ? 'OPEN' : 'CLOSED'}
        </Text>
      </View>

      <View style={styles.contentContainer}>
        {/* Name and Rating */}
        <View style={styles.headerRow}>
          <Text style={[styles.title, { color: themeColors.text }]} numberOfLines={1}>
            {cafe.name}
          </Text>
          <View style={styles.ratingRow}>
            <Ionicons name="star" size={14} color="#F59E0B" />
            <Text style={[styles.ratingText, { color: themeColors.text }]}>
              {cafe.avg_aesthetics && cafe.avg_aesthetics > 0
                ? Number(cafe.avg_aesthetics).toFixed(1)
                : 'N/A'}
            </Text>
          </View>
        </View>

        {/* Distance and Address */}
        <View style={styles.infoRow}>
          <Ionicons name="location-outline" size={14} color={themeColors.textMuted} />
          <Text style={[styles.infoText, { color: themeColors.textMuted }]}>
            {distanceStr} • {walkingMins} min walk • {cafe.address.split(',')[0]}
          </Text>
        </View>

        {/* Middle Line containing Wifi and Quietness info */}
        <View style={styles.specsRow}>
          <View style={[styles.specItem, { backgroundColor: themeColors.surfaceMuted }]}>
            <Ionicons
              name={cafe.wifi_available ? 'wifi' : 'wifi-outline'}
              size={12}
              color={cafe.wifi_available ? themeColors.primary : themeColors.textLight}
            />
            <Text
              style={[
                styles.specText,
                { color: cafe.wifi_available ? themeColors.text : themeColors.textLight },
              ]}
            >
              {cafe.wifi_available
                ? `Wi-Fi (${cafe.wifi_quality || 'Available'})`
                : 'No Wi-Fi'}
            </Text>
          </View>

          <View style={[styles.specItem, { backgroundColor: themeColors.surfaceMuted }]}>
            <Ionicons name="volume-mute-outline" size={12} color={themeColors.primary} />
            <Text style={[styles.specText, { color: themeColors.text }]}>{quietText}</Text>
          </View>
        </View>

        {/* Divider */}
        <View style={[styles.divider, { backgroundColor: themeColors.border }]} />

        {/* Crowd level banner & Directions button */}
        <View style={styles.footerRow}>
          <View
            style={[
              styles.crowdBanner,
              { backgroundColor: crowdInfo.bgColor },
            ]}
          >
            <Ionicons name="people" size={12} color={crowdInfo.textColor} />
            <Text style={[styles.crowdText, { color: crowdInfo.textColor }]}>
              {crowdInfo.text} Crowd{formatCrowdUpdatedAt(cafe.crowd_updated_at, { compact: true }) ? ` · ${formatCrowdUpdatedAt(cafe.crowd_updated_at, { compact: true })}` : ''}
            </Text>
          </View>

          <Pressable
            onPress={(e: any) => {
              if (e && e.stopPropagation) e.stopPropagation();
              router.push(`/(tabs)?routeCafeId=${cafe.id}`);
            }}
            style={({ pressed }) => [
              styles.directionsBtn,
              { backgroundColor: themeColors.primary },
              pressed && { opacity: 0.85 },
            ]}
          >
            <Ionicons name="navigate" size={12} color="#FFF" style={{ marginRight: 4 }} />
            <Text style={styles.directionsBtnText}>Get Directions</Text>
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: THEME.roundness.md,
    borderWidth: 1,
    marginHorizontal: THEME.spacing.lg,
    marginVertical: THEME.spacing.sm,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: 140,
    resizeMode: 'cover',
  },
  placeholderImage: {
    width: '100%',
    height: 140,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heartOverlayBtn: {
    position: 'absolute',
    top: 10,
    left: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
  statusBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: THEME.roundness.sm,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  contentContainer: {
    padding: THEME.spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: THEME.spacing.xs,
  },
  title: {
    fontSize: THEME.typography.sizes.md,
    fontWeight: 'bold',
    flex: 1,
    marginRight: THEME.spacing.sm,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ratingText: {
    fontSize: THEME.typography.sizes.sm,
    fontWeight: 'bold',
    marginLeft: 3,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: THEME.spacing.sm,
  },
  infoText: {
    fontSize: THEME.typography.sizes.xs,
    marginLeft: 4,
  },
  specsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: THEME.spacing.sm,
    marginBottom: THEME.spacing.sm,
  },
  specItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: THEME.roundness.sm,
    gap: 4,
  },
  specText: {
    fontSize: 10,
    fontWeight: '500',
  },
  divider: {
    height: 1,
    width: '100%',
    marginBottom: THEME.spacing.sm,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  crowdBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: THEME.roundness.sm,
    gap: 4,
  },
  crowdText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  timeText: {
    fontSize: 10,
  },
  directionsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: THEME.roundness.sm,
  },
  directionsBtnText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: 'bold',
  },
});
export default CafeCard;
