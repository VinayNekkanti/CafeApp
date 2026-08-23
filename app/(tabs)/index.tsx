import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { useLocation } from '../../src/context/LocationContext';
import { getCafes, getCafeHoursBatch, getFavorites, toggleFavorite } from '../../src/services/data';
import { fetchRoute, RouteResult } from '../../src/services/routing';
import { openCafeDirections } from '../../src/utils/directions';
import { Cafe, CafeHours } from '../../src/types';
import { THEME } from '../../src/constants/theme';
import { getOpenStatus } from '../../src/utils/hours';
import { calculateDistance } from '../../src/utils/distance';
import CafeCard from '../../src/components/CafeCard';
import MapContainer from '../../src/components/MapContainer';
import LoadingScreen from '../../src/components/LoadingScreen';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Alert, Platform } from 'react-native';

export default function ExploreScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ routeCafeId?: string }>();
  const colorScheme = (useColorScheme() ?? 'light') as 'light' | 'dark';
  const themeColors = THEME.colors[colorScheme];

  const { user } = useAuth();
  const { location, loading: locationLoading, requestLocationPermission } = useLocation();

  // State
  const [cafes, setCafes] = useState<Cafe[]>([]);
  const [hours, setHours] = useState<Record<string, CafeHours[]>>({});
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'map'>('map');

  // In-app route preview state
  const [activeRoute, setActiveRoute] = useState<RouteResult | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);

  // Search & Filter state
  const [searchInput, setSearchInput] = useState('');
  const [submittedSearch, setSubmittedSearch] = useState('');
  const [searchSubmitting, setSearchSubmitting] = useState(false);

  const [wifiRequired, setWifiRequired] = useState(false);
  const [openNowOnly, setOpenNowOnly] = useState(false);
  const [quietOnly, setQuietOnly] = useState(false);
  const [lowCrowdOnly, setLowCrowdOnly] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const cafesList = await getCafes();
      setCafes(cafesList);
      
      const cafeIds = cafesList.map((c) => c.id);
      const hoursMap = await getCafeHoursBatch(cafeIds);
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

  // Fetch favorite cafe IDs whenever user logs in or auth state changes
  useEffect(() => {
    if (user) {
      getFavorites(user.id)
        .then(setFavoriteIds)
        .catch((err) => console.error('Error fetching favorites:', err));
    } else {
      setFavoriteIds([]);
    }
  }, [user]);

  const handleFavoriteToggle = async (cafeId: string) => {
    console.log('[Favorites Debug] handleFavoriteToggle invoked for cafe:', cafeId);
    if (!user) {
      console.log('[Favorites Debug] User is unauthenticated. Prompting sign in.');
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

    const isFav = favoriteIds.includes(cafeId);
    const updated = isFav ? favoriteIds.filter((id) => id !== cafeId) : [...favoriteIds, cafeId];
    setFavoriteIds(updated);

    try {
      await toggleFavorite(user.id, cafeId, !isFav);
      console.log(`[Favorites Debug] Successfully ${!isFav ? 'added' : 'removed'} favorite for cafe ${cafeId}`);
    } catch (err: any) {
      setFavoriteIds(favoriteIds); // Revert on error
      console.error('[Favorites Debug] Failed to toggle favorite:', err);
      const msg = err.message || 'Failed to update favorite.';
      if (Platform.OS === 'web') {
        window.alert(`Favorite Error: ${msg}`);
      } else {
        Alert.alert('Favorite Error', msg);
      }
    }
  };

  const handleGetDirections = async (cafe: Cafe) => {
    if (routeLoading) return;
    setRouteLoading(true);
    setRouteError(null);
    setViewMode('map');
    try {
      const route = await fetchRoute(
        { latitude: location.latitude, longitude: location.longitude },
        cafe,
        'driving'
      );
      setActiveRoute(route);
    } catch (err: any) {
      console.error('Error fetching in-app route:', err);
      setRouteError('Unable to load in-app route right now.');
    } finally {
      setRouteLoading(false);
    }
  };

  // Trigger in-app route preview if navigated from Cafe details screen with routeCafeId
  useEffect(() => {
    if (params.routeCafeId && cafes.length > 0) {
      const target = cafes.find((c) => c.id === params.routeCafeId);
      if (target) {
        handleGetDirections(target);
      }
    }
  }, [params.routeCafeId, cafes]);

  const handleSearchSubmit = () => {
    if (searchSubmitting) return;
    const trimmed = searchInput.trim();
    setSearchSubmitting(true);
    setSubmittedSearch(trimmed);
    setTimeout(() => {
      setSearchSubmitting(false);
    }, 150);
  };

  const handleClearSearch = () => {
    setSearchInput('');
    setSubmittedSearch('');
    setSearchSubmitting(false);
  };

  // Filter and sort cafés strictly from Supabase dataset using submittedSearch
  const cleanQuery = submittedSearch.trim().toLowerCase();
  const isSearching = cleanQuery.length > 0;
  const hasActivePillFilters = wifiRequired || openNowOnly || quietOnly || lowCrowdOnly;

  // Memoize filteredCafes so array reference remains unchanged while user is typing in searchInput
  const filteredCafes = useMemo(() => {
    return cafes
      .filter((cafe) => {
        // 1. Search Query (Only applied when user submitted a search)
        if (isSearching) {
          const matchesName = cafe.name.toLowerCase().includes(cleanQuery);
          const matchesAddress = cafe.address.toLowerCase().includes(cleanQuery);
          if (!matchesName && !matchesAddress) return false;
        }

        // 2. Wi-Fi Required
        if (wifiRequired && !cafe.wifi_available) return false;

        // 3. Open Now Only
        if (openNowOnly) {
          const cafeHours = hours[cafe.id] || [];
          const openStatus = getOpenStatus(cafeHours);
          if (!openStatus.isOpen) return false;
        }

        // 4. Quiet environment only (avg rating >= 2.3)
        if (quietOnly && (cafe.avg_quietness === undefined || cafe.avg_quietness < 2.3)) return false;

        // 5. Low/Moderate crowd levels only
        if (lowCrowdOnly && (cafe.current_crowd_level === 'Busy' || cafe.current_crowd_level === 'Full')) return false;

        return true;
      })
      .sort((a, b) => {
        // Sort by distance from user GPS location / UCI fallback
        const distA = calculateDistance(location.latitude, location.longitude, a.latitude, a.longitude);
        const distB = calculateDistance(location.latitude, location.longitude, b.latitude, b.longitude);
        return distA - distB;
      });
  }, [cafes, cleanQuery, isSearching, wifiRequired, openNowOnly, quietOnly, lowCrowdOnly, hours, location.latitude, location.longitude]);

  if (loading || locationLoading) {
    return <LoadingScreen message="Finding the best FindMyCafe locations near you..." />;
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: themeColors.background }]}>
      {/* Top Search & Toggle Section */}
      <View style={[styles.headerContainer, { borderBottomColor: themeColors.border }]}>
        <View style={styles.searchRow}>
          <View style={[styles.searchBar, { backgroundColor: themeColors.surfaceMuted, borderColor: themeColors.border }]}>
            <Ionicons name="search" size={18} color={themeColors.textLight} style={styles.searchIcon} />
            <TextInput
              placeholder="Search cafe name or address..."
              placeholderTextColor={themeColors.textLight}
              style={[styles.searchInput, { color: themeColors.text }]}
              value={searchInput}
              onChangeText={setSearchInput}
              onSubmitEditing={handleSearchSubmit}
              returnKeyType="search"
            />
            {searchInput.length > 0 && (
              <Pressable onPress={handleClearSearch} style={styles.clearIconBtn}>
                <Ionicons name="close-circle" size={16} color={themeColors.textLight} />
              </Pressable>
            )}
          </View>

          <Pressable
            onPress={handleSearchSubmit}
            disabled={searchSubmitting}
            style={({ pressed }) => [
              styles.searchSubmitBtn,
              { backgroundColor: themeColors.primary },
              pressed && { opacity: 0.8 },
              searchSubmitting && { opacity: 0.7 },
            ]}
          >
            {searchSubmitting ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Text style={styles.searchSubmitBtnText}>Search</Text>
            )}
          </Pressable>
        </View>

        {/* View Mode Segmented Tab Selector */}
        <View style={styles.segmentedWrapper}>
          <View style={[styles.segmentedContainer, { backgroundColor: themeColors.surfaceMuted }]}>
            <Pressable
              onPress={() => setViewMode('map')}
              style={[
                styles.segmentItem,
                viewMode === 'map' && [
                  styles.segmentActive,
                  { backgroundColor: themeColors.surface },
                  colorScheme === 'dark' ? THEME.shadows.dark : THEME.shadows.light
                ]
              ]}
            >
              <Ionicons
                name={viewMode === 'map' ? 'map' : 'map-outline'}
                size={16}
                color={viewMode === 'map' ? themeColors.primary : themeColors.textMuted}
                style={styles.segmentIcon}
              />
              <Text style={[
                styles.segmentText,
                { color: viewMode === 'map' ? themeColors.text : themeColors.textMuted }
              ]}>
                Map View
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setViewMode('list')}
              style={[
                styles.segmentItem,
                viewMode === 'list' && [
                  styles.segmentActive,
                  { backgroundColor: themeColors.surface },
                  colorScheme === 'dark' ? THEME.shadows.dark : THEME.shadows.light
                ]
              ]}
            >
              <Ionicons
                name={viewMode === 'list' ? 'list' : 'list-outline'}
                size={16}
                color={viewMode === 'list' ? themeColors.primary : themeColors.textMuted}
                style={styles.segmentIcon}
              />
              <Text style={[
                styles.segmentText,
                { color: viewMode === 'list' ? themeColors.text : themeColors.textMuted }
              ]}>
                List View
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Filter Pills Scroll */}
        <View style={styles.filterContainer}>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={[
              { id: 'wifi', label: 'Wi-Fi Available', active: wifiRequired, toggle: () => setWifiRequired(!wifiRequired), icon: 'wifi' },
              { id: 'open', label: 'Open Now', active: openNowOnly, toggle: () => setOpenNowOnly(!openNowOnly), icon: 'time-outline' },
              { id: 'quiet', label: 'Quiet Spot', active: quietOnly, toggle: () => setQuietOnly(!quietOnly), icon: 'volume-mute-outline' },
              { id: 'crowd', label: 'Not Crowded', active: lowCrowdOnly, toggle: () => setLowCrowdOnly(!lowCrowdOnly), icon: 'people-outline' },
            ]}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.filterListContent}
            renderItem={({ item }) => (
              <Pressable
                onPress={item.toggle}
                style={[
                  styles.filterPill,
                  {
                    backgroundColor: item.active ? themeColors.primary : themeColors.surfaceMuted,
                    borderColor: item.active ? themeColors.primary : themeColors.border,
                  },
                ]}
              >
                <Ionicons
                  name={item.icon as any}
                  size={12}
                  color={item.active ? '#FFF' : themeColors.textMuted}
                  style={styles.pillIcon}
                />
                <Text style={[styles.filterText, { color: item.active ? '#FFF' : themeColors.text }]}>
                  {item.label}
                </Text>
              </Pressable>
            )}
          />
        </View>
      </View>

      {/* Location Fallback Warning Banner */}
      {location.isFallback && (
        <View style={[styles.locationBanner, { backgroundColor: themeColors.warningLight }]}>
          <Ionicons name="warning" size={16} color={themeColors.warning} />
          <Text style={[styles.locationBannerText, { color: themeColors.warning }]}>
            Location disabled. Showing spots near UC Irvine campus.
          </Text>
          <Pressable onPress={requestLocationPermission} style={styles.enableLocBtn}>
            <Text style={[styles.enableLocText, { color: themeColors.primaryLight }]}>Enable</Text>
          </Pressable>
        </View>
      )}

      {/* Main View Area */}
      {error ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="cloud-offline-outline" size={48} color={themeColors.danger} />
          <Text style={[styles.emptyTitle, { color: themeColors.text }]}>Connection Error</Text>
          <Text style={[styles.emptySubtitle, { color: themeColors.textMuted, textAlign: 'center', marginHorizontal: 24 }]}>
            {error}
          </Text>
          <Pressable
            onPress={fetchData}
            style={[styles.resetBtn, { backgroundColor: themeColors.primary, marginTop: THEME.spacing.md }]}
          >
            <Text style={styles.resetBtnText}>Retry Connection</Text>
          </Pressable>
        </View>
      ) : viewMode === 'list' ? (
        <FlatList
          data={filteredCafes}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <CafeCard
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
              <Ionicons name={isSearching ? "search-outline" : "cafe-outline"} size={48} color={themeColors.textLight} />
              <Text style={[styles.emptyTitle, { color: themeColors.text }]}>
                {isSearching ? 'Cafe Not Found' : 'No FindMyCafe Locations Found'}
              </Text>
              <Text style={[styles.emptySubtitle, { color: themeColors.textMuted }]}>
                {isSearching
                  ? "We couldn't find that café in our current FindMyCafe database."
                  : 'Try adjusting your active filters.'}
              </Text>
              <View style={styles.emptyActionRow}>
                {isSearching && (
                  <Pressable
                    onPress={handleClearSearch}
                    style={[styles.resetBtn, { backgroundColor: themeColors.primary }]}
                  >
                    <Text style={styles.resetBtnText}>Clear Search</Text>
                  </Pressable>
                )}
                {hasActivePillFilters && (
                  <Pressable
                    onPress={() => {
                      setWifiRequired(false);
                      setOpenNowOnly(false);
                      setQuietOnly(false);
                      setLowCrowdOnly(false);
                    }}
                    style={[
                      styles.resetBtn,
                      { backgroundColor: themeColors.surfaceMuted, borderWidth: 1, borderColor: themeColors.border }
                    ]}
                  >
                    <Text style={[styles.resetBtnText, { color: themeColors.text }]}>Reset Filters</Text>
                  </Pressable>
                )}
              </View>
            </View>
          }
        />
      ) : filteredCafes.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name={isSearching ? "search-outline" : "cafe-outline"} size={48} color={themeColors.textLight} />
          <Text style={[styles.emptyTitle, { color: themeColors.text }]}>
            {isSearching ? 'Cafe Not Found' : 'No FindMyCafe Locations Found'}
          </Text>
          <Text style={[styles.emptySubtitle, { color: themeColors.textMuted }]}>
            {isSearching
              ? "We couldn't find that café in our current FindMyCafe database."
              : 'Try adjusting your active filters.'}
          </Text>
          <View style={styles.emptyActionRow}>
            {isSearching && (
              <Pressable
                onPress={handleClearSearch}
                style={[styles.resetBtn, { backgroundColor: themeColors.primary }]}
              >
                <Text style={styles.resetBtnText}>Clear Search</Text>
              </Pressable>
            )}
            {hasActivePillFilters && (
              <Pressable
                onPress={() => {
                  setWifiRequired(false);
                  setOpenNowOnly(false);
                  setQuietOnly(false);
                  setLowCrowdOnly(false);
                }}
                style={[
                  styles.resetBtn,
                  { backgroundColor: themeColors.surfaceMuted, borderWidth: 1, borderColor: themeColors.border }
                ]}
              >
                <Text style={[styles.resetBtnText, { color: themeColors.text }]}>Reset Filters</Text>
              </Pressable>
            )}
          </View>
        </View>
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

          {/* Route Loading Floating Banner */}
          {routeLoading && (
            <View style={[styles.routeLoadingCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
              <ActivityIndicator size="small" color={themeColors.primary} />
              <Text style={[styles.routeLoadingText, { color: themeColors.text }]}>Calculating route...</Text>
            </View>
          )}

          {/* Route Error Floating Banner */}
          {routeError && !routeLoading && (
            <View style={[styles.routeLoadingCard, { backgroundColor: themeColors.dangerLight || '#FEE2E2', borderColor: themeColors.danger }]}>
              <Ionicons name="alert-circle" size={18} color={themeColors.danger} />
              <Text style={[styles.routeLoadingText, { color: themeColors.danger }]}>{routeError}</Text>
              <Pressable onPress={() => setRouteError(null)} style={{ marginLeft: 'auto', padding: 4 }}>
                <Ionicons name="close" size={18} color={themeColors.danger} />
              </Pressable>
            </View>
          )}

          {/* Route Summary Floating Overlay Card */}
          {activeRoute && !routeLoading && (
            <View style={[styles.routeSummaryCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
              <View style={styles.routeHeaderRow}>
                <View style={[styles.routeIconBox, { backgroundColor: themeColors.primary + '1F' }]}>
                  <Ionicons name="car-sport" size={20} color={themeColors.primary} />
                </View>
                <View style={styles.routeInfoCol}>
                  <Text style={[styles.routeName, { color: themeColors.text }]} numberOfLines={1}>
                    Route to {activeRoute.cafe.name}
                  </Text>
                  <Text style={[styles.routeMetrics, { color: themeColors.textMuted }]}>
                    <Text style={{ fontWeight: 'bold', color: themeColors.primary }}>{activeRoute.distanceMiles} mi</Text> • {activeRoute.durationMinutes} min drive
                  </Text>
                </View>
                <Pressable
                  onPress={() => setActiveRoute(null)}
                  style={[styles.closeRouteBtn, { backgroundColor: themeColors.surfaceMuted }]}
                >
                  <Ionicons name="close" size={18} color={themeColors.textMuted} />
                </Pressable>
              </View>

              <View style={styles.routeActionRow}>
                <Pressable
                  onPress={() => openCafeDirections(activeRoute.cafe, location)}
                  style={({ pressed }) => [
                    styles.startNavBtn,
                    { backgroundColor: themeColors.primary },
                    pressed && { opacity: 0.9 },
                  ]}
                >
                  <Ionicons name="navigate" size={16} color="#FFF" style={{ marginRight: 6 }} />
                  <Text style={styles.startNavText}>Start Navigation</Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  headerContainer: {
    paddingVertical: THEME.spacing.sm,
    borderBottomWidth: 1,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: THEME.spacing.lg,
    gap: THEME.spacing.sm,
    marginBottom: THEME.spacing.sm,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: THEME.roundness.md,
    paddingHorizontal: THEME.spacing.md,
    height: 44,
  },
  searchIcon: {
    marginRight: THEME.spacing.xs,
  },
  searchInput: {
    flex: 1,
    fontSize: THEME.typography.sizes.sm,
    fontWeight: '500',
  },
  clearIconBtn: {
    padding: 4,
  },
  searchSubmitBtn: {
    height: 44,
    paddingHorizontal: 16,
    borderRadius: THEME.roundness.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchSubmitBtnText: {
    color: '#FFF',
    fontSize: THEME.typography.sizes.xs + 1,
    fontWeight: 'bold',
  },
  segmentedWrapper: {
    paddingHorizontal: THEME.spacing.lg,
    marginBottom: THEME.spacing.sm,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  segmentedContainer: {
    flexDirection: 'row',
    borderRadius: THEME.roundness.md,
    padding: 2,
    height: 36,
    width: 180,
  },
  segmentItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: THEME.roundness.sm + 2,
    gap: 6,
  },
  segmentActive: {
    // Background and shadow styles applied dynamically in render
  },
  segmentIcon: {
    marginRight: 2,
  },
  segmentText: {
    fontSize: 12,
    fontWeight: '600',
  },
  filterContainer: {
    paddingLeft: THEME.spacing.lg,
  },
  filterListContent: {
    paddingRight: THEME.spacing.lg,
    gap: THEME.spacing.xs,
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: THEME.roundness.full,
    borderWidth: 1,
  },
  pillIcon: {
    marginRight: 4,
  },
  filterText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  locationBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: THEME.spacing.lg,
    gap: THEME.spacing.sm,
  },
  locationBannerText: {
    flex: 1,
    fontSize: 11,
    fontWeight: '600',
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: THEME.spacing.lg,
    gap: THEME.spacing.sm,
  },
  statusText: {
    flex: 1,
    fontSize: 11,
    fontWeight: '600',
  },
  enableLocBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  enableLocText: {
    fontSize: 11,
    fontWeight: 'bold',
    textDecorationLine: 'underline',
  },
  listContent: {
    paddingVertical: THEME.spacing.sm,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    paddingHorizontal: THEME.spacing.xl,
  },
  emptyTitle: {
    fontSize: THEME.typography.sizes.md,
    fontWeight: 'bold',
    marginTop: THEME.spacing.md,
    marginBottom: THEME.spacing.xs,
  },
  emptySubtitle: {
    fontSize: THEME.typography.sizes.sm,
    textAlign: 'center',
    marginBottom: THEME.spacing.md,
  },
  emptyActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: THEME.spacing.sm,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  resetBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: THEME.roundness.md,
  },
  resetBtnText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  routeLoadingCard: {
    position: 'absolute',
    top: 16,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    padding: THEME.spacing.md,
    borderRadius: THEME.roundness.md,
    borderWidth: 1,
    gap: THEME.spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
    zIndex: 99,
  },
  routeLoadingText: {
    fontSize: THEME.typography.sizes.xs + 1,
    fontWeight: '600',
  },
  routeSummaryCard: {
    position: 'absolute',
    top: 16,
    left: 16,
    right: 16,
    borderRadius: THEME.roundness.md,
    borderWidth: 1,
    padding: THEME.spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
    zIndex: 99,
    gap: THEME.spacing.sm,
  },
  routeHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: THEME.spacing.sm,
  },
  routeIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeInfoCol: {
    flex: 1,
  },
  routeName: {
    fontSize: THEME.typography.sizes.sm,
    fontWeight: 'bold',
  },
  routeMetrics: {
    fontSize: THEME.typography.sizes.xs,
    marginTop: 2,
  },
  closeRouteBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeActionRow: {
    flexDirection: 'row',
    marginTop: 4,
  },
  startNavBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: THEME.roundness.md,
  },
  startNavText: {
    color: '#FFF',
    fontSize: THEME.typography.sizes.xs + 1,
    fontWeight: 'bold',
  },
});
