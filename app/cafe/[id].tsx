import React, { useEffect, useState } from 'react';
import { Alert, Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Heart } from 'lucide-react-native';
import { useAuth } from '../../src/context/AuthContext';
import { useLocation } from '../../src/context/LocationContext';
import { getCafes, getCafeHours, getFavorites, submitCafeReview, submitRating, getCafeReviews, toggleFavorite } from '../../src/services/data';
import { Cafe, CafeHours, CafeReview } from '../../src/types';
import { THEME, crowdLabel, crowdLevelNumber } from '../../src/constants/theme';
import { Divider, Kicker, CrowdMeter, OutlineButton } from '../../src/components/classical';
import { calculateDistance, formatDistance, estimateWalkingTime, estimateDrivingTime } from '../../src/utils/distance';
import { getOpenStatus, formatWeeklyHours } from '../../src/utils/hours';
import { formatCrowdUpdatedAt } from '../../src/utils/time';
import RateNoteSheet from '../../src/components/RateNoteSheet';
import LoadingScreen from '../../src/components/LoadingScreen';

const { colors: C, spacing: SPACING, type: TYPE } = THEME;

const CROWD_NOTES: Record<string, string> = {
  Light: 'Light crowd. Plenty of open tables and quiet seating.',
  'Half full': 'Moderate crowd. Seating is available with steady activity.',
  Busy: 'Busy. Tables are filling up quickly.',
  Full: 'Near capacity. Seating is limited.',
};

export default function CafeProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { user } = useAuth();
  const { location } = useLocation();

  const [cafe, setCafe] = useState<Cafe | null>(null);
  const [hours, setHours] = useState<CafeHours[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetMode, setSheetMode] = useState<'rate' | 'note' | null>(null);
  const [isFavorite, setIsFavorite] = useState(false);
  const [imageError, setImageError] = useState(false);

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

  useEffect(() => {
    fetchData();
  }, [id, user]);

  const promptSignIn = (message: string) => {
    if (Platform.OS === 'web') {
      if (window.confirm(`Sign In Required: ${message} Would you like to sign in now?`)) {
        router.push('/auth');
      }
    } else {
      Alert.alert('Sign In Required', `${message} Would you like to sign in now?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign In', onPress: () => router.push('/auth') },
      ]);
    }
  };

  const openSheet = (mode: 'rate' | 'note') => {
    if (!user) {
      promptSignIn(`You need to be signed in to ${mode === 'rate' ? 'rate a room' : 'leave a note'}.`);
      return;
    }
    setSheetMode(mode);
  };

  const handleSubmitNote = async (text: string) => {
    if (!cafe) return;
    await submitCafeReview(cafe.id, text);
    await fetchReviewsData(cafe.id);
  };

  const handleSubmitRating = async (quietness: number, aesthetics: number) => {
    if (!cafe || !user) return;
    await submitRating(cafe.id, user.id, quietness, aesthetics);
    await fetchData();
  };

  const handleFavoriteToggle = async () => {
    if (!user) {
      promptSignIn('You need to be signed in to save favorites.');
      return;
    }
    if (!cafe) return;
    const newStatus = !isFavorite;
    setIsFavorite(newStatus);
    try {
      await toggleFavorite(user.id, cafe.id, newStatus);
    } catch (err: any) {
      setIsFavorite(!newStatus);
      const msg = err.message || 'Failed to update favorite.';
      if (Platform.OS === 'web') window.alert(`Favorite Error: ${msg}`);
      else Alert.alert('Favorite Error', msg);
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
      <View style={styles.centered}>
        <Text style={[TYPE.screenTitle, { fontSize: 26, color: C.text }]}>Café not found</Text>
        <OutlineButton label="Go Back" onPress={() => router.back()} style={{ marginTop: SPACING.lg }} />
      </View>
    );
  }

  const distanceMiles = calculateDistance(location.latitude, location.longitude, cafe.latitude, cafe.longitude);
  const walkingMins = estimateWalkingTime(distanceMiles);
  const drivingMins = estimateDrivingTime(distanceMiles);

  const openStatus = getOpenStatus(hours);
  const weeklyHours = formatWeeklyHours(hours);
  const today = new Date().getDay();

  const crowdLevel = crowdLevelNumber(cafe.current_crowd_level);
  const crowdWord = crowdLabel(crowdLevel);
  const crowdAgo = formatCrowdUpdatedAt(cafe.crowd_updated_at);

  return (
    <View style={styles.mainContainer}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Hero */}
        <View style={styles.heroWrap}>
          {cafe.image_url && !imageError ? (
            <Image source={{ uri: cafe.image_url }} style={styles.heroImage} onError={() => setImageError(true)} />
          ) : (
            <View style={styles.heroPlaceholder} />
          )}

          <View style={[styles.heroOverlayRow, { top: insets.top + 8 }]}>
            <Pressable onPress={handleFavoriteToggle} style={[styles.circleBtn, isFavorite && styles.circleBtnActive]} hitSlop={4}>
              <Heart size={17} strokeWidth={1.7} color={isFavorite ? C.accent700 : C.textMuted} fill={isFavorite ? C.accent700 : 'none'} />
            </Pressable>
          </View>
        </View>

        <View style={styles.body}>
          <Kicker tone="accent">{openStatus.isOpen ? 'Open now' : 'Closed now'}</Kicker>
          <Text style={[TYPE.display, { color: C.text, marginTop: 8 }]}>{cafe.name}</Text>
          <Pressable onPress={openDirections} style={{ marginTop: SPACING.sm }}>
            <Text style={[TYPE.bodyTight, { color: C.accent700, textDecorationLine: 'underline' }]}>{cafe.address}</Text>
          </Pressable>

          <View style={styles.factsRow}>
            <Text style={[TYPE.meta, { color: C.textSecondary }]}>{walkingMins} min walk</Text>
            <Text style={[TYPE.meta, { color: C.textSecondary }]}>·</Text>
            <Text style={[TYPE.meta, { color: C.textSecondary }]}>{drivingMins} min drive</Text>
            <Text style={[TYPE.meta, { color: C.textSecondary }]}>·</Text>
            <Text style={[TYPE.meta, { color: C.textSecondary }]}>
              ★ {cafe.avg_aesthetics && cafe.avg_aesthetics > 0 ? cafe.avg_aesthetics.toFixed(1) : '—'} ({totalReviewCount})
            </Text>
          </View>

          <Divider style={styles.sectionDivider} />

          {/* Crowd level */}
          <Kicker>Crowd level</Kicker>
          <View style={styles.crowdFigureRow}>
            <Text style={[TYPE.numeral, { color: C.text }]}>{crowdLevel}</Text>
            <Text style={[TYPE.bodyTight, { color: C.textMuted }]}>of 10 · {crowdWord}</Text>
          </View>
          <CrowdMeter level={crowdLevel} size={9} />
          <Text style={[TYPE.body, { color: C.text, marginTop: SPACING.md }]}>
            {CROWD_NOTES[crowdWord] || CROWD_NOTES.Light}
          </Text>
          {crowdAgo && (
            <Text style={[TYPE.metaSmall, { color: C.textMuted, marginTop: 8 }]}>Updated {crowdAgo} by café staff</Text>
          )}

          <Divider style={styles.sectionDivider} />

          {/* Wi-Fi */}
          <Kicker>Wi-Fi</Kicker>
          <Text style={[TYPE.sectionValue, { color: C.text, marginTop: 6 }]}>
            {cafe.wifi_available ? cafe.wifi_quality || 'Available' : 'None'}
          </Text>
          <Text style={[TYPE.metaSmall, { color: C.textMuted }]}>rated by administrators</Text>

          <Divider style={styles.sectionDivider} />

          {/* Hours */}
          <View style={styles.hoursHeaderRow}>
            <Kicker>Hours</Kicker>
            <Text style={[TYPE.meta, { color: C.accent700 }]}>{openStatus.statusText}</Text>
          </View>
          <View style={{ marginTop: SPACING.sm }}>
            {weeklyHours.map((h, idx) => (
              <View key={h.day} style={[styles.hoursRow, { borderBottomColor: C.divider }]}>
                <Text style={[TYPE.bodyTight, { color: idx === today ? C.text : C.textMuted, fontWeight: idx === today ? '600' : '400' }]}>
                  {h.day}
                </Text>
                <Text style={[TYPE.bodyTight, { color: idx === today ? C.text : C.textMuted, fontWeight: idx === today ? '600' : '400' }]}>
                  {h.hoursStr}
                </Text>
              </View>
            ))}
          </View>

          <Divider style={styles.sectionDivider} />

          {/* Student notes */}
          <View style={styles.hoursHeaderRow}>
            <Kicker>Student notes ({totalReviewCount})</Kicker>
            <Pressable onPress={() => openSheet('note')} hitSlop={8}>
              <Text style={[TYPE.metaSmall, { color: C.accent700 }]}>Write one</Text>
            </Pressable>
          </View>

          {reviewsLoading ? (
            <Text style={[TYPE.bodyTight, { color: C.textMuted, marginTop: SPACING.sm }]}>Loading notes…</Text>
          ) : reviewsError ? (
            <Text style={[TYPE.bodyTight, { color: C.danger, marginTop: SPACING.sm }]}>Unable to load notes right now.</Text>
          ) : reviews.length === 0 ? (
            <Text style={[TYPE.bodyTight, { color: C.textMuted, marginTop: SPACING.sm }]}>
              No notes yet. Be the first to share your study experience.
            </Text>
          ) : (
            reviews.map((rev) => (
              <View key={rev.id} style={[styles.reviewRow, { borderTopColor: C.divider }]}>
                <Text style={[TYPE.body, { color: C.text, fontStyle: 'italic' }]}>{rev.review_text}</Text>
                <Text style={[TYPE.kicker, { color: C.textMuted, marginTop: 8 }]}>
                  {(rev.user_display_name || 'Anonymous Student').toUpperCase()} ·{' '}
                  {new Date(rev.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }).toUpperCase()}
                </Text>
              </View>
            ))
          )}

          {/* Actions */}
          <View style={styles.actionsRow}>
            <OutlineButton label="Get Directions" onPress={openDirections} style={{ flex: 1 }} />
            <OutlineButton label="Rate" variant="secondary" onPress={() => openSheet('rate')} style={styles.rateBtn} />
          </View>
        </View>
      </ScrollView>

      <RateNoteSheet
        visible={sheetMode !== null}
        mode={sheetMode || 'rate'}
        cafeName={cafe.name}
        initialQuietness={cafe.avg_quietness ? Math.round(cafe.avg_quietness) : 3}
        initialAesthetics={cafe.avg_aesthetics ? Math.round(cafe.avg_aesthetics) : 4}
        onClose={() => setSheetMode(null)}
        onSubmitRating={handleSubmitRating}
        onSubmitNote={handleSubmitNote}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  mainContainer: { flex: 1, backgroundColor: C.bg },
  scrollContent: { paddingBottom: 40 },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xl,
    backgroundColor: C.bg,
  },
  heroWrap: {
    position: 'relative',
    width: '100%',
    height: 260,
    backgroundColor: C.surface,
    padding: 8,
  },
  heroImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  heroPlaceholder: { width: '100%', height: '100%', backgroundColor: '#e1d9cc' },
  heroOverlayRow: {
    position: 'absolute',
    left: 18,
    right: 18,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  circleBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: C.hairlineStrong,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleBtnActive: {
    borderColor: C.accent,
  },
  body: {
    paddingHorizontal: SPACING.screen,
    paddingTop: 22,
  },
  factsRow: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginTop: SPACING.md,
  },
  sectionDivider: {
    marginTop: 27.6,
    marginBottom: SPACING.lg,
  },
  crowdFigureRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10,
    marginTop: SPACING.sm,
    marginBottom: SPACING.md,
  },
  hoursHeaderRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  hoursRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 9,
    borderBottomWidth: 1,
  },
  reviewRow: {
    borderTopWidth: 1,
    paddingVertical: SPACING.md,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: 27.6,
  },
  rateBtn: {
    paddingHorizontal: SPACING.lg,
  },
});
