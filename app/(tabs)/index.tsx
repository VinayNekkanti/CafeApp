import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Search, Heart } from 'lucide-react-native';
import { useAuth } from '../../src/context/AuthContext';
import { useLocation } from '../../src/context/LocationContext';
import { getCafes, getCafeHoursBatch, getFavorites, toggleFavorite } from '../../src/services/data';
import { fetchRoute, RouteResult } from '../../src/services/routing';
import { openCafeDirections } from '../../src/utils/directions';
import { Cafe, CafeHours } from '../../src/types';
import { THEME, crowdLabel, crowdLevelNumber } from '../../src/constants/theme';
import { Divider, Kicker, CrowdMeter, OutlineButton, Chip, Plate } from '../../src/components/classical';
import { getOpenStatus } from '../../src/utils/hours';
import { calculateDistance, formatDistance, estimateWalkingTime } from '../../src/utils/distance';
import MapContainer from '../../src/components/MapContainer';
import LoadingScreen from '../../src/components/LoadingScreen';

const { colors: C, spacing: SPACING, radius: RADIUS, type: TYPE, shadow: SHADOW } = THEME;

/** The 76px café row that fills the Explore list — see design handoff README, "1. Explore / List". */
function ExploreRow({
  cafe,
  hours,
  userLat,
  userLon,
  isFavorite,
  onToggleFavorite,
  onPress,
}: {
  cafe: Cafe;
  hours: CafeHours[];
  userLat: number;
  userLon: number;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onPress: () => void;
}) {
  const distanceMiles = calculateDistance(userLat, userLon, cafe.latitude, cafe.longitude);
  const walkMins = estimateWalkingTime(distanceMiles);
  const openStatus = getOpenStatus(hours);
  const crowdLevel = crowdLevelNumber(cafe.current_crowd_level);
  const rating = cafe.avg_aesthetics && cafe.avg_aesthetics > 0 ? cafe.avg_aesthetics.toFixed(1) : '—';

  const quietWord = (() => {
    const q = cafe.avg_quietness || 0;
    if (q === 0) return null;
    if (q <= 1.6) return 'LOUD';
    if (q <= 2.3) return 'MODERATE';
    return 'QUIET';
  })();

  const wifiWord = cafe.wifi_available ? `WI-FI ${(cafe.wifi_quality || 'AVAILABLE').toUpperCase()}` : 'NO WI-FI';
  const tagLine = [openStatus.statusText.toUpperCase(), wifiWord, quietWord].filter(Boolean).join(' · ');

  return (
    <View style={styles.row}>
      <View style={styles.rowInner}>
        <Pressable onPress={onPress}>
          <Plate size={76} source={cafe.image_url ? { uri: cafe.image_url } : null} />
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={styles.titleRow}>
            <Pressable onPress={onPress} style={{ flex: 1, minWidth: 0 }}>
              <Text style={[TYPE.cardTitle, { color: C.text }]} numberOfLines={1}>{cafe.name}</Text>
            </Pressable>
            <Text style={[TYPE.meta, { color: C.textSecondary }]}>★ {rating}</Text>
            <Pressable onPress={onToggleFavorite} style={styles.favBtn} hitSlop={8}>
              <Heart
                size={15}
                strokeWidth={1.7}
                color={isFavorite ? C.accent700 : C.textLight}
                fill={isFavorite ? C.accent700 : 'none'}
              />
            </Pressable>
          </View>

          <Text style={[TYPE.meta, styles.metaLine, { color: C.textMuted }]}>
            {formatDistance(distanceMiles)} · {walkMins} min walk · {cafe.address.split(',')[0]}
          </Text>

          <View style={styles.crowdRow}>
            <CrowdMeter level={crowdLevel} size={6} />
            <Text style={[TYPE.kicker, { color: C.textSecondary }]}>
              {crowdLevel}/10 · {crowdLabel(crowdLevel).toUpperCase()}
            </Text>
          </View>

          <Text style={[TYPE.kicker, styles.tagLine, { color: C.textMuted }]} numberOfLines={1}>
            {tagLine}
          </Text>
        </View>
      </View>
    </View>
  );
}

export default function ExploreScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ routeCafeId?: string }>();

  const { user } = useAuth();
  const { location, loading: locationLoading, requestLocationPermission } = useLocation();

  const [cafes, setCafes] = useState<Cafe[]>([]);
  const [hours, setHours] = useState<Record<string, CafeHours[]>>({});
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'list' | 'map'>('map');

  const [activeRoute, setActiveRoute] = useState<RouteResult | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [wifi, setWifi] = useState(true); // Wi-Fi defaults on, per design handoff
  const [openNow, setOpenNow] = useState(false);
  const [quietOnly, setQuietOnly] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const cafesList = await getCafes();
      setCafes(cafesList);
      const hoursMap = await getCafeHoursBatch(cafesList.map((c) => c.id));
      setHours(hoursMap);
    } catch (err: any) {
      console.error('Error fetching explore data:', err);
      setError(err.message || 'Failed to fetch cafes from Supabase.');
      setCafes([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (user) {
      getFavorites(user.id).then(setFavoriteIds).catch((err) => console.error('Error fetching favorites:', err));
    } else {
      setFavoriteIds([]);
    }
  }, [user]);

  const handleFavoriteToggle = async (cafeId: string) => {
    if (!user) {
      const promptSignIn = () => router.push('/auth');
      if (Platform.OS === 'web') {
        if (window.confirm('Sign In Required: You need to be signed in to save favorites. Would you like to sign in now?')) {
          promptSignIn();
        }
      } else {
        Alert.alert(
          'Authentication Required',
          'You need to be signed in to save favorites. Would you like to sign in now?',
          [{ text: 'Cancel', style: 'cancel' }, { text: 'Sign In', onPress: promptSignIn }]
        );
      }
      return;
    }

    const isFav = favoriteIds.includes(cafeId);
    const updated = isFav ? favoriteIds.filter((id) => id !== cafeId) : [...favoriteIds, cafeId];
    setFavoriteIds(updated);
    try {
      await toggleFavorite(user.id, cafeId, !isFav);
    } catch (err: any) {
      setFavoriteIds(favoriteIds);
      const msg = err.message || 'Failed to update favorite.';
      if (Platform.OS === 'web') window.alert(`Favorite Error: ${msg}`);
      else Alert.alert('Favorite Error', msg);
    }
  };

  const handleGetDirections = async (cafe: Cafe) => {
    if (routeLoading) return;
    setRouteLoading(true);
    setRouteError(null);
    setView('map');
    try {
      const route = await fetchRoute({ latitude: location.latitude, longitude: location.longitude }, cafe, 'driving');
      setActiveRoute(route);
    } catch (err: any) {
      console.error('Error fetching in-app route:', err);
      setRouteError('Unable to load in-app route right now.');
    } finally {
      setRouteLoading(false);
    }
  };

  useEffect(() => {
    if (params.routeCafeId && cafes.length > 0) {
      const target = cafes.find((c) => c.id === params.routeCafeId);
      if (target) handleGetDirections(target);
    }
  }, [params.routeCafeId, cafes]);

  const cleanQuery = query.trim().toLowerCase();
  const isSearching = cleanQuery.length > 0;

  const filteredCafes = useMemo(() => {
    return cafes
      .filter((cafe) => {
        if (isSearching) {
          const matches = cafe.name.toLowerCase().includes(cleanQuery) || cafe.address.toLowerCase().includes(cleanQuery);
          if (!matches) return false;
        }
        if (wifi && !cafe.wifi_available) return false;
        if (openNow && !getOpenStatus(hours[cafe.id] || []).isOpen) return false;
        if (quietOnly && (cafe.avg_quietness === undefined || cafe.avg_quietness < 2.3)) return false;
        return true;
      })
      .sort((a, b) => {
        const distA = calculateDistance(location.latitude, location.longitude, a.latitude, a.longitude);
        const distB = calculateDistance(location.latitude, location.longitude, b.latitude, b.longitude);
        return distA - distB;
      });
  }, [cafes, cleanQuery, isSearching, wifi, openNow, quietOnly, hours, location.latitude, location.longitude]);

  if (loading || locationLoading) {
    return <LoadingScreen message="Finding the best FindMyCafe locations near you..." />;
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={styles.brandRow}>
            <Plate size={40}>
              <Image source={require('../../assets/images/logo.png')} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
            </Plate>
            <View>
              <Text style={[TYPE.screenTitle, { fontSize: 28, color: C.text }]}>FindMyCafe</Text>
              <Kicker style={{ marginTop: 5, fontSize: 10.5 }}>Study spots · UC Irvine</Kicker>
            </View>
          </View>

          <View style={styles.segmented}>
            <Pressable onPress={() => setView('list')} style={[styles.segmentBtn, view === 'list' && styles.segmentBtnActive]}>
              <Text style={[TYPE.kicker, { color: view === 'list' ? C.inverseText : C.textSecondary }]}>List</Text>
            </Pressable>
            <Pressable onPress={() => setView('map')} style={[styles.segmentBtn, view === 'map' && styles.segmentBtnActive]}>
              <Text style={[TYPE.kicker, { color: view === 'map' ? C.inverseText : C.textSecondary }]}>Map</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.searchRow}>
          <Search size={15} color={C.accent700} strokeWidth={1.7} />
          <TextInput
            placeholder="Search a café or address"
            placeholderTextColor={C.textLight}
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
          />
        </View>

        <View style={styles.chipRow}>
          <Chip label="Wi-Fi" active={wifi} onPress={() => setWifi(!wifi)} />
          <Chip label="Open now" active={openNow} onPress={() => setOpenNow(!openNow)} />
          <Chip label="Quiet" active={quietOnly} onPress={() => setQuietOnly(!quietOnly)} />
        </View>
        <Divider />
      </View>

      {location.isFallback && (
        <View style={styles.locationBanner}>
          <Text style={[TYPE.metaSmall, { color: C.accent700, flex: 1 }]}>
            Location disabled. Showing spots near UC Irvine campus.
          </Text>
          <Pressable onPress={requestLocationPermission}>
            <Text style={[TYPE.metaSmall, { color: C.accent700, textDecorationLine: 'underline' }]}>Enable</Text>
          </Pressable>
        </View>
      )}

      {error ? (
        <View style={styles.emptyContainer}>
          <Text style={[TYPE.screenTitle, { fontSize: 24, color: C.text }]}>Connection error</Text>
          <Text style={[TYPE.body, styles.emptySubtitle, { color: C.textSecondary }]}>{error}</Text>
          <OutlineButton label="Retry Connection" onPress={fetchData} style={{ marginTop: SPACING.md }} />
        </View>
      ) : view === 'list' ? (
        <FlatList
          data={filteredCafes}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <View style={styles.metaRow}>
              <Kicker>{filteredCafes.length} {filteredCafes.length === 1 ? 'spot' : 'spots'} near you</Kicker>
              <Kicker tone="accent">Nearest first</Kicker>
            </View>
          }
          renderItem={({ item }) => (
            <ExploreRow
              cafe={item}
              hours={hours[item.id] || []}
              userLat={location.latitude}
              userLon={location.longitude}
              isFavorite={favoriteIds.includes(item.id)}
              onToggleFavorite={() => handleFavoriteToggle(item.id)}
              onPress={() => router.push(`/cafe/${item.id}`)}
            />
          )}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={[TYPE.screenTitle, { fontSize: 24, color: C.text }]}>Nothing matches yet</Text>
              <Text style={[TYPE.body, styles.emptySubtitle, { color: C.textSecondary }]}>
                Clear a filter or widen the search.
              </Text>
            </View>
          }
        />
      ) : (
        <View style={{ flex: 1, position: 'relative' }}>
          <MapContainer
            cafes={filteredCafes}
            hours={hours}
            userLat={location.latitude}
            userLon={location.longitude}
            isSearching={isSearching}
            activeRoute={activeRoute}
            favoriteIds={favoriteIds}
            onToggleFavorite={handleFavoriteToggle}
            onSelectCafe={(id) => router.push(`/cafe/${id}`)}
          />

          {routeLoading && (
            <View style={styles.routeCard}>
              <Kicker>Route</Kicker>
              <Text style={[TYPE.body, { color: C.textMuted, marginTop: 4 }]}>Calculating route…</Text>
            </View>
          )}

          {routeError && !routeLoading && (
            <View style={styles.routeCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={[TYPE.body, { color: C.danger, flex: 1 }]}>{routeError}</Text>
                <Pressable onPress={() => setRouteError(null)} hitSlop={8}>
                  <Text style={[TYPE.kicker, { color: C.textMuted }]}>Close</Text>
                </Pressable>
              </View>
            </View>
          )}

          {activeRoute && !routeLoading && (
            <View style={styles.routeCard}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Kicker>Route</Kicker>
                  <Text style={[TYPE.cardTitle, { color: C.text, marginTop: 4 }]} numberOfLines={1}>
                    {activeRoute.cafe.name}
                  </Text>
                  <Text style={[TYPE.meta, { color: C.textSecondary, marginTop: 2 }]}>
                    {activeRoute.distanceMiles} mi · {activeRoute.durationMinutes} min drive
                  </Text>
                </View>
                <Pressable onPress={() => setActiveRoute(null)} hitSlop={8} style={styles.routeCloseBtn}>
                  <Text style={{ color: C.textMuted, fontSize: 16 }}>×</Text>
                </Pressable>
              </View>
              <OutlineButton
                label="Start Navigation"
                onPress={() => openCafeDirections(activeRoute.cafe, location)}
                style={{ marginTop: SPACING.sm }}
              />
            </View>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: C.bg },
  header: {
    paddingHorizontal: SPACING.screen,
    paddingTop: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  segmented: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: C.divider,
    borderRadius: RADIUS.md,
    overflow: 'hidden',
  },
  segmentBtn: {
    minHeight: 44,
    paddingHorizontal: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentBtnActive: {
    backgroundColor: C.text,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: C.hairlineStrong,
    paddingBottom: 8,
  },
  searchInput: {
    flex: 1,
    fontFamily: THEME.fonts.body,
    fontSize: 15,
    color: C.text,
    paddingVertical: 6,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginVertical: SPACING.md,
  },
  locationBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: 8,
    paddingHorizontal: SPACING.screen,
    backgroundColor: C.accent100,
  },
  listContent: {
    paddingHorizontal: SPACING.screen,
    paddingBottom: 130,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingVertical: 4,
    marginBottom: 4,
  },
  row: {
    borderTopWidth: 1,
    borderTopColor: C.divider,
    paddingVertical: SPACING.lg,
  },
  rowInner: {
    flexDirection: 'row',
    gap: SPACING.md,
    alignItems: 'flex-start',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  favBtn: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -14,
    marginRight: -12,
    marginBottom: -14,
  },
  metaLine: {
    marginTop: 4,
  },
  crowdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: SPACING.md,
  },
  tagLine: {
    marginTop: 8,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    paddingHorizontal: SPACING.xl,
  },
  emptySubtitle: {
    marginTop: 6,
    textAlign: 'center',
  },
  routeCard: {
    position: 'absolute',
    top: 16,
    left: 12,
    right: 12,
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.hairlineStrong,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    ...SHADOW.sm,
  },
  routeCloseBtn: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    margin: -14,
  },
});
