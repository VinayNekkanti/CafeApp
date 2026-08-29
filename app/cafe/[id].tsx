import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { useLocation } from '../../src/context/LocationContext';
import { getCafes, getCafeHours, getFavorites, submitCafeReview, getCafeReviews, toggleFavorite } from '../../src/services/data';
import { Cafe, CafeHours, CafeReview } from '../../src/types';
import { THEME } from '../../src/constants/theme';
import { calculateDistance, formatDistance, estimateWalkingTime, estimateDrivingTime } from '../../src/utils/distance';
import { openCafeDirections } from '../../src/utils/directions';
import { getOpenStatus, formatWeeklyHours } from '../../src/utils/hours';
import { formatCrowdUpdatedAt } from '../../src/utils/time';
import ReviewModal from '../../src/components/ReviewModal';
import LoadingScreen from '../../src/components/LoadingScreen';
import Ionicons from '@expo/vector-icons/Ionicons';

export default function CafeProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colorScheme = (useColorScheme() ?? 'light') as 'light' | 'dark';
  const themeColors = THEME.colors[colorScheme];

  const { user } = useAuth();
  const { location } = useLocation();

  // State
  const [cafe, setCafe] = useState<Cafe | null>(null);
  const [hours, setHours] = useState<CafeHours[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewModalVisible, setReviewModalVisible] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [imageError, setImageError] = useState(false);

  // Reviews State
  const [reviews, setReviews] = useState<CafeReview[]>([]);
  const [totalReviewCount, setTotalReviewCount] = useState<number>(0);
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const [reviewsError, setReviewsError] = useState(false);

  const fetchReviewsData = async (cafeId: string) => {
    setReviewsLoading(true);
    setReviewsError(false);
    try {
      const { reviews: revs, totalCount } = await getCafeReviews(cafeId);
      setReviews(revs);
      setTotalReviewCount(totalCount);
    } catch (err) {
      console.error('Error fetching cafe reviews:', err);
      setReviewsError(true);
    } finally {
      setReviewsLoading(false);
    }
  };

  const fetchData = async () => {
    if (!id) return;
    setLoading(true);
    try {
      // Fetch café by ID from list
      const cafes = await getCafes();
      const selectedCafe = cafes.find((c) => c.id === id);
      setCafe(selectedCafe || null);

      if (selectedCafe) {
        const cafeHours = await getCafeHours(id);
        setHours(cafeHours);
        await fetchReviewsData(id);
      }

      if (user) {
        const favs = await getFavorites(user.id);
        setFavorites(favs);
        setIsFavorite(favs.includes(id));
      }
    } catch (err) {
      console.error('Error fetching cafe profile:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleReviewTrigger = () => {
    if (!user) {
      if (Platform.OS === 'web') {
        const confirmSignIn = window.confirm(
          'Sign In Required: You need to be signed in to leave a review. Would you like to sign in now?'
        );
        if (confirmSignIn) {
          router.push('/auth');
        }
      } else {
        Alert.alert(
          'Sign In Required',
          'You need to be signed in to leave a review. Would you like to sign in now?',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Sign In', onPress: () => router.push('/auth') },
          ]
        );
      }
      return;
    }
    setReviewModalVisible(true);
  };

  const handleReviewSubmit = async (reviewText: string) => {
    if (!cafe) return;
    await submitCafeReview(cafe.id, reviewText);
    if (id) {
      await fetchReviewsData(id);
    }
  };

  useEffect(() => {
    fetchData();
  }, [id, user]);

  const handleFavoriteToggle = async () => {
    if (!user) {
      if (Platform.OS === 'web') {
        const confirmSignIn = window.confirm(
          'Sign In Required: You need to be signed in to save favorites. Would you like to sign in now?'
        );
        if (confirmSignIn) {
          router.push('/auth');
        }
      } else {
        Alert.alert(
          'Authentication Required',
          'You need to be signed in to save favorites. Would you like to sign in now?',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Sign In', onPress: () => router.push('/auth') },
          ]
        );
      }
      return;
    }

    if (!cafe) return;
    const newStatus = !isFavorite;
    setIsFavorite(newStatus);
    try {
      await toggleFavorite(user.id, cafe.id, newStatus);
      console.log(`[Favorites Debug Profile] Toggled favorite for ${cafe.id} to ${newStatus}`);
    } catch (err: any) {
      setIsFavorite(!newStatus); // revert on error
      console.error('[Favorites Debug Profile] Failed to toggle favorite:', err);
      const msg = err.message || 'Failed to update favorite.';
      if (Platform.OS === 'web') {
        window.alert(`Favorite Error: ${msg}`);
      } else {
        Alert.alert('Favorite Error', msg);
      }
    }
  };

  const openDirections = () => {
    if (!cafe) return;
    router.push(`/(tabs)?routeCafeId=${cafe.id}`);
  };

  if (loading) {
    return <LoadingScreen message="Loading café profile details..." />;
  }

  if (!cafe) {
    return (
      <View style={[styles.centered, { backgroundColor: themeColors.background }]}>
        <Ionicons name="alert-circle-outline" size={60} color={themeColors.danger} />
        <Text style={[styles.errorText, { color: themeColors.text }]}>Café not found</Text>
        <Pressable onPress={() => router.back()} style={[styles.backBtn, { backgroundColor: themeColors.primary }]}>
          <Text style={styles.backBtnText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  // Distance computations
  const distanceMiles = calculateDistance(location.latitude, location.longitude, cafe.latitude, cafe.longitude);
  const distanceStr = formatDistance(distanceMiles);
  const walkingMins = estimateWalkingTime(distanceMiles);
  const drivingMins = estimateDrivingTime(distanceMiles);

  // Status & Hours
  const openStatus = getOpenStatus(hours);
  const weeklyHours = formatWeeklyHours(hours);

  // Get Crowd badge details
  const getCrowdDetails = () => {
    const rawCrowd = cafe.current_crowd_level || 'Low';
    let crowdStr = String(rawCrowd);
    let color = themeColors.success;
    let bgColor = themeColors.successLight;
    let desc = 'Plenty of open tables. Perfect for spreading out!';

    const parsedNum = parseInt(crowdStr, 10);
    if (!isNaN(parsedNum)) {
      crowdStr = `${parsedNum}/10`;
      if (parsedNum <= 3) {
        color = themeColors.success;
        bgColor = themeColors.successLight;
        desc = 'Light crowd. Plenty of open tables and quiet seating.';
      } else if (parsedNum <= 6) {
        color = themeColors.warning;
        bgColor = themeColors.warningLight;
        desc = 'Moderate crowd. Seating is available with steady activity.';
      } else if (parsedNum <= 8) {
        color = themeColors.accent;
        bgColor = themeColors.accentLight;
        desc = 'Busy. Sparse seating available; filling up rapidly.';
      } else {
        color = themeColors.danger;
        bgColor = themeColors.dangerLight;
        desc = 'Extremely crowded. Near or at maximum seating capacity.';
      }
    } else {
      if (rawCrowd === 'Moderate') {
        color = themeColors.warning;
        bgColor = themeColors.warningLight;
        desc = 'Some seating available. Comfortable volume.';
      } else if (rawCrowd === 'Busy') {
        color = themeColors.accent;
        bgColor = themeColors.accentLight;
        desc = 'Sparse tables remaining. May need to share counter space.';
      } else if (rawCrowd === 'Full') {
        color = themeColors.danger;
        bgColor = themeColors.dangerLight;
        desc = 'No seating left. Employees report maximum capacity.';
      }
    }

    return { crowd: crowdStr, color, bgColor, desc };
  };

  const crowdDetails = getCrowdDetails();

  return (
    <View style={[styles.mainContainer, { backgroundColor: themeColors.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Café Image Header */}
        <View style={styles.imageContainer}>
          {cafe.image_url && !imageError ? (
            <Image
              source={{ uri: cafe.image_url }}
              style={styles.image}
              onError={() => setImageError(true)}
            />
          ) : (
            <View style={[styles.placeholderImage, { backgroundColor: themeColors.surfaceMuted }]}>
              <Ionicons name="cafe-outline" size={60} color={themeColors.textLight} />
            </View>
          )}

          {/* Action Row Overlay on Image */}
          <View style={styles.overlayRow}>
            <Pressable
              onPress={() => router.back()}
              style={[styles.circleBtn, { backgroundColor: 'rgba(0,0,0,0.4)' }]}
            >
              <Ionicons name="arrow-back" size={22} color="#FFF" />
            </Pressable>
            
            <Pressable
              onPress={handleFavoriteToggle}
              style={[styles.circleBtn, { backgroundColor: 'rgba(0,0,0,0.4)' }]}
            >
              <Ionicons
                name={isFavorite ? 'heart' : 'heart-outline'}
                size={22}
                color={isFavorite ? '#EF4444' : '#FFF'}
              />
            </Pressable>
          </View>
        </View>

        {/* Café Information Section */}
        <View style={styles.infoWrapper}>
          <View style={styles.titleRow}>
            <Text style={[styles.cafeName, { color: themeColors.text }]}>{cafe.name}</Text>
            <View
              style={[
                styles.openBadge,
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
                  styles.openBadgeText,
                  {
                    color:
                      openStatus.badgeColor === 'success'
                        ? themeColors.success
                        : themeColors.danger,
                  },
                ]}
              >
                {openStatus.isOpen ? 'OPEN NOW' : 'CLOSED'}
              </Text>
            </View>
          </View>

          {/* Address & Distance */}
          <Pressable onPress={openDirections} style={styles.addressRow}>
            <Ionicons name="location-outline" size={16} color={themeColors.textMuted} />
            <Text style={[styles.addressText, { color: themeColors.textMuted }]}>
              {cafe.address}
            </Text>
          </Pressable>

          <View style={styles.commuteRow}>
            <View style={styles.commuteItem}>
              <Ionicons name="walk" size={16} color={themeColors.primary} />
              <Text style={[styles.commuteText, { color: themeColors.text }]}>
                {walkingMins} mins walk ({distanceStr})
              </Text>
            </View>
            <View style={styles.commuteItem}>
              <Ionicons name="car" size={16} color={themeColors.primary} />
              <Text style={[styles.commuteText, { color: themeColors.text }]}>
                {drivingMins} mins drive
              </Text>
            </View>
          </View>

          {/* Divider */}
          <View style={[styles.sectionDivider, { backgroundColor: themeColors.border }]} />

          {/* Employee-updated Crowd Status */}
          <View style={styles.profileSection}>
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.sectionHeading, { color: themeColors.text }]}>Crowd Level</Text>
            </View>

            <View style={[styles.crowdBannerFull, { backgroundColor: crowdDetails.bgColor }]}>
              <View style={styles.crowdStatusRow}>
                <Ionicons name="people" size={18} color={crowdDetails.color} />
                <Text style={[styles.crowdStatusText, { color: crowdDetails.color }]}>
                  {crowdDetails.crowd} Status
                </Text>
                {formatCrowdUpdatedAt(cafe.crowd_updated_at) ? (
                  <Text style={[styles.crowdTimestampInside, { color: themeColors.textMuted }]}>
                    · {formatCrowdUpdatedAt(cafe.crowd_updated_at)}
                  </Text>
                ) : null}
              </View>
              <Text style={[styles.crowdDesc, { color: themeColors.textMuted }]}>
                {crowdDetails.desc}
              </Text>
            </View>
            <Text style={[styles.employeeDisclaimer, { color: themeColors.textLight }]}>
              ⚠️ Crowd levels are updated by café store managers.
            </Text>
          </View>

          {/* Divider */}
          <View style={[styles.sectionDivider, { backgroundColor: themeColors.border }]} />

          {/* Wi-Fi Details */}
          <View style={styles.profileSection}>
            <Text style={[styles.sectionHeading, { color: themeColors.text }]}>Internet Connection</Text>
            <View style={[styles.specItemRow, { backgroundColor: themeColors.surfaceMuted, borderColor: themeColors.border }]}>
              <Ionicons
                name={cafe.wifi_available ? 'wifi' : 'wifi-outline'}
                size={22}
                color={cafe.wifi_available ? themeColors.primary : themeColors.textLight}
              />
              <View style={styles.specItemContent}>
                <Text style={[styles.specTitle, { color: themeColors.text }]}>
                  {cafe.wifi_available ? 'Wi-Fi Available' : 'No Wi-Fi Connection'}
                </Text>
                <Text style={[styles.specDesc, { color: themeColors.textMuted }]}>
                  {cafe.wifi_available
                    ? `Administrators rate this connection as: ${cafe.wifi_quality || 'Good'}`
                    : 'No public internet connection provided by this location.'}
                </Text>
              </View>
            </View>
          </View>

          {/* Divider */}
          <View style={[styles.sectionDivider, { backgroundColor: themeColors.border }]} />

          {/* Weekly Hours list */}
          <View style={styles.profileSection}>
            <Text style={[styles.sectionHeading, { color: themeColors.text }]}>Operating Hours</Text>
            <Text style={[styles.todayHoursAlert, { color: themeColors.primaryLight }]}>
              {openStatus.statusText}
            </Text>
            <View style={[styles.hoursBox, { backgroundColor: themeColors.surfaceMuted, borderColor: themeColors.border }]}>
              {weeklyHours.map((h, idx) => {
                const isToday = new Date().getDay() === idx;
                return (
                  <View key={h.day} style={styles.hoursRow}>
                    <Text
                      style={[
                        styles.dayText,
                        {
                          color: isToday ? themeColors.text : themeColors.textMuted,
                          fontWeight: isToday ? 'bold' : 'normal',
                        },
                      ]}
                    >
                      {h.day}
                    </Text>
                    <Text
                      style={[
                        styles.hoursText,
                        {
                          color: isToday ? themeColors.text : themeColors.textMuted,
                          fontWeight: isToday ? 'bold' : 'normal',
                        },
                      ]}
                    >
                      {h.hoursStr}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>

          {/* Divider */}
          <View style={[styles.sectionDivider, { backgroundColor: themeColors.border }]} />

          {/* Leave a Review Action Section */}
          <View style={styles.profileSection}>
            <Pressable
              onPress={handleReviewTrigger}
              style={({ pressed }) => [
                styles.reviewActionBanner,
                { backgroundColor: themeColors.surfaceMuted, borderColor: themeColors.border },
                pressed && { opacity: 0.9 },
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.reviewActionTitle, { color: themeColors.text }]}>Visited this café?</Text>
                <Text style={[styles.reviewActionSub, { color: themeColors.textMuted }]}>
                  Share your study experience with us!
                </Text>
              </View>
              <View style={[styles.leaveReviewBtn, { backgroundColor: themeColors.primary }]}>
                <Ionicons name="chatbox-ellipses" size={15} color="#FFF" style={{ marginRight: 6 }} />
                <Text style={styles.leaveReviewBtnText}>Leave a Review!</Text>
              </View>
            </Pressable>
          </View>

          {/* Public Reviews List Section */}
          <View style={[styles.profileSection, { marginTop: 16 }]}>
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.sectionHeading, { color: themeColors.text }]}>
                Reviews ({totalReviewCount})
              </Text>
            </View>

            {reviewsLoading ? (
              <View style={styles.reviewsLoadingBox}>
                <ActivityIndicator color={themeColors.primary} size="small" />
                <Text style={[styles.loadingReviewsText, { color: themeColors.textMuted }]}>Loading reviews...</Text>
              </View>
            ) : reviewsError ? (
              <View style={[styles.emptyReviewBox, { backgroundColor: themeColors.surfaceMuted, borderColor: themeColors.border }]}>
                <Ionicons name="alert-circle-outline" size={24} color={themeColors.danger} />
                <Text style={[styles.emptyReviewTitle, { color: themeColors.text }]}>Unable to load reviews right now.</Text>
              </View>
            ) : reviews.length === 0 ? (
              <View style={[styles.emptyReviewBox, { backgroundColor: themeColors.surfaceMuted, borderColor: themeColors.border }]}>
                <Ionicons name="chatbubbles-outline" size={30} color={themeColors.textLight} />
                <Text style={[styles.emptyReviewTitle, { color: themeColors.text }]}>No reviews yet.</Text>
                <Text style={[styles.emptyReviewSub, { color: themeColors.textMuted }]}>
                  Be the first to share your study experience!
                </Text>
              </View>
            ) : (
              <View style={{ gap: 12, marginTop: 8 }}>
                {reviews.map((rev) => (
                  <View
                    key={rev.id}
                    style={[
                      styles.reviewCard,
                      { backgroundColor: themeColors.surfaceMuted, borderColor: themeColors.border },
                    ]}
                  >
                    <View style={styles.reviewCardHeader}>
                      <View style={styles.reviewerRow}>
                        <View style={[styles.reviewerAvatar, { backgroundColor: themeColors.primary }]}>
                          <Text style={styles.reviewerAvatarText}>
                            {(rev.user_display_name || 'A').charAt(0).toUpperCase()}
                          </Text>
                        </View>
                        <Text style={[styles.reviewerName, { color: themeColors.text }]}>
                          {rev.user_display_name || 'Anonymous Student'}
                        </Text>
                      </View>
                      <Text style={[styles.reviewDate, { color: themeColors.textLight }]}>
                        {new Date(rev.created_at).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </Text>
                    </View>
                    <Text style={[styles.reviewBodyText, { color: themeColors.text }]}>
                      {rev.review_text}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      {/* Floating Action footer buttons */}
      <View
        style={[
          styles.actionFooter,
          { backgroundColor: themeColors.surface, borderTopColor: themeColors.border },
        ]}
      >
        <Pressable
          onPress={openDirections}
          style={[styles.primaryBtn, { backgroundColor: themeColors.primary, flex: 1 }]}
        >
          <Ionicons name="navigate-outline" size={18} color="#FFF" style={styles.btnIcon} />
          <Text style={styles.primaryBtnText}>Get Directions</Text>
        </Pressable>
      </View>

      {/* Leave a Review Modal */}
      <ReviewModal
        visible={reviewModalVisible}
        onClose={() => setReviewModalVisible(false)}
        onSubmit={handleReviewSubmit}
        cafeName={cafe.name}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  mainContainer: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 100, // accommodate action footer
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: THEME.spacing.xl,
  },
  errorText: {
    fontSize: THEME.typography.sizes.lg,
    fontWeight: 'bold',
    marginTop: THEME.spacing.md,
    marginBottom: THEME.spacing.lg,
  },
  backBtn: {
    paddingHorizontal: THEME.spacing.lg,
    paddingVertical: THEME.spacing.md,
    borderRadius: THEME.roundness.md,
  },
  backBtnText: {
    color: '#FFF',
    fontWeight: 'bold',
  },
  imageContainer: {
    position: 'relative',
    width: '100%',
    height: 220,
  },
  image: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  placeholderImage: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlayRow: {
    position: 'absolute',
    top: 50,
    left: THEME.spacing.lg,
    right: THEME.spacing.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    zIndex: 10,
  },
  circleBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoWrapper: {
    paddingHorizontal: THEME.spacing.lg,
    paddingTop: THEME.spacing.lg,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: THEME.spacing.sm,
    marginBottom: THEME.spacing.xs,
  },
  cafeName: {
    fontSize: THEME.typography.sizes.xl,
    fontWeight: 'bold',
    flex: 1,
  },
  openBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: THEME.roundness.sm,
  },
  openBadgeText: {
    fontSize: 9,
    fontWeight: 'bold',
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: THEME.spacing.md,
    gap: 4,
  },
  addressText: {
    fontSize: THEME.typography.sizes.xs,
    textDecorationLine: 'underline',
  },
  commuteRow: {
    flexDirection: 'row',
    gap: THEME.spacing.lg,
    marginBottom: THEME.spacing.md,
  },
  commuteItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  commuteText: {
    fontSize: THEME.typography.sizes.xs,
    fontWeight: '500',
  },
  sectionDivider: {
    height: 1,
    width: '100%',
    marginVertical: THEME.spacing.lg,
  },
  profileSection: {
    alignItems: 'stretch',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: THEME.spacing.sm,
  },
  sectionHeading: {
    fontSize: THEME.typography.sizes.md,
    fontWeight: 'bold',
    marginBottom: THEME.spacing.sm,
  },
  updatedTimestamp: {
    fontSize: 10,
    fontWeight: '500',
  },
  crowdBannerFull: {
    padding: THEME.spacing.md,
    borderRadius: THEME.roundness.md,
    gap: 4,
  },
  crowdStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  crowdStatusText: {
    fontSize: THEME.typography.sizes.sm,
    fontWeight: 'bold',
  },
  crowdTimestampInside: {
    fontSize: 12,
    fontWeight: '500',
  },
  crowdDesc: {
    fontSize: THEME.typography.sizes.xs,
    lineHeight: 16,
  },
  employeeDisclaimer: {
    fontSize: 9,
    marginTop: THEME.spacing.xs,
    fontWeight: '500',
  },
  specItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: THEME.spacing.md,
    borderRadius: THEME.roundness.md,
    borderWidth: 1,
    gap: THEME.spacing.md,
  },
  specItemContent: {
    flex: 1,
    gap: 2,
  },
  specTitle: {
    fontSize: THEME.typography.sizes.sm,
    fontWeight: 'bold',
  },
  specDesc: {
    fontSize: 11,
    lineHeight: 16,
  },
  todayHoursAlert: {
    fontSize: THEME.typography.sizes.xs,
    fontWeight: 'bold',
    marginBottom: THEME.spacing.sm,
  },
  hoursBox: {
    borderWidth: 1,
    borderRadius: THEME.roundness.md,
    padding: THEME.spacing.md,
    gap: THEME.spacing.sm,
  },
  hoursRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dayText: {
    fontSize: THEME.typography.sizes.xs,
  },
  hoursText: {
    fontSize: THEME.typography.sizes.xs,
  },
  actionFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    paddingVertical: THEME.spacing.md,
    paddingHorizontal: THEME.spacing.lg,
    borderTopWidth: 1,
    gap: THEME.spacing.md,
  },
  primaryBtn: {
    flex: 2,
    flexDirection: 'row',
    height: 48,
    borderRadius: THEME.roundness.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    color: '#FFF',
    fontSize: THEME.typography.sizes.sm,
    fontWeight: 'bold',
  },
  btnIcon: {
    marginRight: 6,
  },
  leaveReviewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: THEME.roundness.full,
  },
  leaveReviewBtnText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  reviewActionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: THEME.spacing.md,
    borderRadius: THEME.roundness.md,
    borderWidth: 1,
    gap: THEME.spacing.sm,
  },
  reviewActionTitle: {
    fontSize: THEME.typography.sizes.sm,
    fontWeight: 'bold',
  },
  reviewActionSub: {
    fontSize: 11,
    marginTop: 2,
  },
  reviewsLoadingBox: {
    paddingVertical: THEME.spacing.md,
    alignItems: 'center',
  },
  loadingReviewsText: {
    fontSize: 12,
    marginTop: 4,
  },
  emptyReviewBox: {
    padding: THEME.spacing.lg,
    borderRadius: THEME.roundness.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  emptyReviewTitle: {
    fontSize: THEME.typography.sizes.sm,
    fontWeight: 'bold',
    marginTop: 4,
  },
  emptyReviewSub: {
    fontSize: 12,
    textAlign: 'center',
  },
  reviewCard: {
    padding: THEME.spacing.md,
    borderRadius: THEME.roundness.md,
    borderWidth: 1,
    gap: 8,
  },
  reviewCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  reviewerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  reviewerAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewerAvatarText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  reviewerName: {
    fontSize: THEME.typography.sizes.xs,
    fontWeight: 'bold',
  },
  reviewDate: {
    fontSize: 11,
  },
  reviewBodyText: {
    fontSize: THEME.typography.sizes.sm,
    lineHeight: 20,
  },
});
