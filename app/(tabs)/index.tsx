import React, { useEffect, useState } from 'react';
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
import { useRouter } from 'expo-router';
import { useLocation } from '../../src/context/LocationContext';
import { getCafes, getCafeHoursBatch } from '../../src/services/data';
import { Cafe, CafeHours } from '../../src/types';
import { THEME } from '../../src/constants/theme';
import { getOpenStatus } from '../../src/utils/hours';
import { calculateDistance } from '../../src/utils/distance';
import { geocodeAddress, GeocodeError } from '../../src/utils/geocode';
import CafeCard from '../../src/components/CafeCard';
import MapContainer from '../../src/components/MapContainer';
import LoadingScreen from '../../src/components/LoadingScreen';
import Ionicons from '@expo/vector-icons/Ionicons';

export default function ExploreScreen() {
  const router = useRouter();
  const colorScheme = (useColorScheme() ?? 'light') as 'light' | 'dark';
  const themeColors = THEME.colors[colorScheme];

  const { location, loading: locationLoading, requestLocationPermission } = useLocation();

  // State
  const [cafes, setCafes] = useState<Cafe[]>([]);
  const [hours, setHours] = useState<Record<string, CafeHours[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');

  // Filters state
  const [searchQuery, setSearchQuery] = useState('');
  const [wifiRequired, setWifiRequired] = useState(false);
  const [openNowOnly, setOpenNowOnly] = useState(false);
  const [quietOnly, setQuietOnly] = useState(false);
  const [lowCrowdOnly, setLowCrowdOnly] = useState(false);

  // Geocoding states
  const [searchCoordinates, setSearchCoordinates] = useState<{ latitude: number; longitude: number; displayName?: string } | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

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

  // Debounced geocoding search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchCoordinates(null);
      setSearchError(null);
      setSearchLoading(false);
      return;
    }

    const delayDebounceFn = setTimeout(async () => {
      setSearchLoading(true);
      setSearchError(null);
      try {
        const result = await geocodeAddress(searchQuery);
        if (result) {
          setSearchCoordinates({
            latitude: result.lat,
            longitude: result.lng,
            displayName: result.displayName,
          });
        } else {
          setSearchCoordinates(null);
          setSearchError('Address not found.');
        }
      } catch (err: any) {
        setSearchCoordinates(null);
        if (err instanceof GeocodeError) {
          if (err.code === 'RATE_LIMIT') {
            setSearchError('Rate limit exceeded. Please try again in a moment.');
          } else if (err.code === 'NO_KEY') {
            // Keep silent local fallback if API key is not configured
            console.warn(err.message);
          } else {
            setSearchError(err.message);
          }
        } else {
          setSearchError('Failed to geocode this address.');
        }
      } finally {
        setSearchLoading(false);
      }
    }, 450); // 450ms debounce to prevent burning through free tier limits

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery]);

  // Filter and sort cafés
  const filteredCafes = cafes
    .filter((cafe) => {
      // 1. Search Query (Filter locally only if we haven't successfully geocoded the address to a point)
      if (searchQuery.trim() && !searchCoordinates) {
        const query = searchQuery.toLowerCase();
        const matchesName = cafe.name.toLowerCase().includes(query);
        const matchesAddress = cafe.address.toLowerCase().includes(query);
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
      // Sort by distance from geocoded address (if available) or user GPS location / UCI fallback
      const referenceLat = searchCoordinates ? searchCoordinates.latitude : location.latitude;
      const referenceLon = searchCoordinates ? searchCoordinates.longitude : location.longitude;
      const distA = calculateDistance(referenceLat, referenceLon, a.latitude, a.longitude);
      const distB = calculateDistance(referenceLat, referenceLon, b.latitude, b.longitude);
      return distA - distB;
    });

  if (loading || locationLoading) {
    return <LoadingScreen message="Finding the best study spots near you..." />;
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
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <Pressable onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={16} color={themeColors.textLight} />
              </Pressable>
            )}
          </View>
        </View>

        {/* View Mode Segmented Tab Selector */}
        <View style={styles.segmentedWrapper}>
          <View style={[styles.segmentedContainer, { backgroundColor: themeColors.surfaceMuted }]}>
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

      {/* Geocoding Loading Banner */}
      {searchLoading && (
        <View style={[styles.statusBanner, { backgroundColor: themeColors.surfaceMuted }]}>
          <ActivityIndicator size="small" color={themeColors.primary} style={{ marginRight: 8 }} />
          <Text style={[styles.statusText, { color: themeColors.textMuted }]}>
            Searching address coordinates...
          </Text>
        </View>
      )}

      {/* Geocoding Error/No-Results Banner */}
      {searchError && (
        <View style={[styles.statusBanner, { backgroundColor: themeColors.warningLight }]}>
          <Ionicons name="alert-circle" size={16} color={themeColors.warning} />
          <Text style={[styles.statusText, { color: themeColors.warning }]}>
            {searchError}
          </Text>
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
              onPress={() => router.push(`/cafe/${item.id}`)}
            />
          )}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="cafe" size={48} color={themeColors.textLight} />
              <Text style={[styles.emptyTitle, { color: themeColors.text }]}>No Study Spots Found</Text>
              <Text style={[styles.emptySubtitle, { color: themeColors.textMuted }]}>
                Try adjusting your search query or filters.
              </Text>
              <Pressable
                onPress={() => {
                  setSearchQuery('');
                  setWifiRequired(false);
                  setOpenNowOnly(false);
                  setQuietOnly(false);
                  setLowCrowdOnly(false);
                }}
                style={[styles.resetBtn, { backgroundColor: themeColors.primary }]}
              >
                <Text style={styles.resetBtnText}>Clear All Filters</Text>
              </Pressable>
            </View>
          }
        />
      ) : (
        <MapContainer
          cafes={filteredCafes}
          hours={hours}
          userLat={location.latitude}
          userLon={location.longitude}
          searchCoordinates={searchCoordinates}
          onSelectCafe={(id) => router.push(`/cafe/${id}`)}
        />
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
    marginBottom: THEME.spacing.lg,
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
});
