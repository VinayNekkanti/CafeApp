import React, { useRef, useState, useEffect } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Cafe, CafeHours } from '../types';
import { THEME, crowdLabel, crowdLevelNumber } from '../constants/theme';
import { calculateDistance, formatDistance } from '../utils/distance';
import { openCafeDirections } from '../utils/directions';
import { RouteResult } from '../services/routing';
import { getOpenStatus } from '../utils/hours';
import { CrowdMeter } from './classical';
import { TriangleAlert, Map as MapIcon, CloudOff, Heart } from 'lucide-react-native';

// Conditional import to prevent crash on web
let MapView: any;
let Marker: any;
let Polyline: any;
let PROVIDER_GOOGLE: any;

if (Platform.OS !== 'web') {
  const Maps = require('react-native-maps');
  MapView = Maps.default;
  Marker = Maps.Marker;
  Polyline = Maps.Polyline;
  PROVIDER_GOOGLE = Maps.PROVIDER_GOOGLE;
}

interface MapContainerProps {
  cafes: Cafe[];
  hours: Record<string, CafeHours[]>;
  userLat: number;
  userLon: number;
  isSearching?: boolean;
  activeRoute?: RouteResult | null;
  searchCoordinates?: { latitude: number; longitude: number; displayName?: string } | null;
  favoriteIds?: string[];
  onToggleFavorite?: (cafeId: string) => void;
  onSelectCafe: (cafeId: string) => void;
}

const { width } = Dimensions.get('window');
const CARD_WIDTH = width * 0.78;
const CARD_SPACING = THEME.spacing.sm;
// Shared by both directions of the carousel<->map sync: reading the settled
// index back out of a scroll offset, and scrolling programmatically to a
// given index. Keeping one formula for both stops them from disagreeing.
const SLIDE_SIZE = CARD_WIDTH + CARD_SPACING * 2;

export const MapContainer: React.FC<MapContainerProps> = ({
  cafes,
  hours,
  userLat,
  userLon,
  isSearching = false,
  activeRoute = null,
  searchCoordinates = null,
  favoriteIds = [],
  onToggleFavorite,
  onSelectCafe,
}) => {
  const themeColors = THEME.colors;

  const mapRef = useRef<any>(null);
  const listRef = useRef<FlatList>(null);
  const searchMarkerRef = useRef<any>(null);
  const webMarkersRef = useRef<any[]>([]);
  const [activeCafeIndex, setActiveCafeIndex] = useState(0);

  // Web MapTiler state
  const [sdkLoaded, setSdkLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const mapContainerRef = useRef<any>(null);

  // Parse the API key and potential custom style from environment variable
  let rawApiKey = process.env.EXPO_PUBLIC_MAPTILER_API_KEY || '';
  let parsedApiKey = rawApiKey;
  let customStyle: string | null = null;

  if (rawApiKey.includes('key=')) {
    try {
      // Clean query parameter if user pasted full URL
      const url = new URL(rawApiKey);
      const keyParam = url.searchParams.get('key');
      if (keyParam) parsedApiKey = keyParam;
      
      const match = url.pathname.match(/\/maps\/([^\/]+)/);
      if (match && match[1]) {
        customStyle = match[1];
      }
    } catch (e) {
      const matchKey = rawApiKey.match(/[?&]key=([^&]+)/);
      if (matchKey && matchKey[1]) parsedApiKey = matchKey[1];
    }
  }

  const apiKey = parsedApiKey;
  const isKeyConfigured = apiKey && apiKey !== 'your_maptiler_api_key' && !apiKey.startsWith('your_');

  // Focus region for native
  const initialRegion = {
    latitude: userLat,
    longitude: userLon,
    latitudeDelta: 0.04,
    longitudeDelta: 0.04,
  };

  // Dynamically load MapTiler SDK on Web
  useEffect(() => {
    if (Platform.OS !== 'web' || !isKeyConfigured) return;

    if ((window as any).maptilersdk) {
      setSdkLoaded(true);
      return;
    }

    const cssId = 'maptiler-sdk-css';
    if (!document.getElementById(cssId)) {
      const link = document.createElement('link');
      link.id = cssId;
      link.rel = 'stylesheet';
      link.href = 'https://cdn.maptiler.com/maptiler-sdk-js/v2.0.3/maptiler-sdk.css';
      document.head.appendChild(link);
    }

    const scriptId = 'maptiler-sdk-js';
    let script = document.getElementById(scriptId) as HTMLScriptElement;
    if (!script) {
      script = document.createElement('script');
      script.id = scriptId;
      script.src = 'https://cdn.maptiler.com/maptiler-sdk-js/v2.0.3/maptiler-sdk.umd.min.js';
      script.async = true;
      document.body.appendChild(script);
    }

    const onScriptLoad = () => {
      setSdkLoaded(true);
    };

    const onScriptError = () => {
      setLoadError(true);
    };

    script.addEventListener('load', onScriptLoad);
    script.addEventListener('error', onScriptError);

    return () => {
      script.removeEventListener('load', onScriptLoad);
      script.removeEventListener('error', onScriptError);
    };
  }, [isKeyConfigured]);

  // Initialize MapTiler on Web
  useEffect(() => {
    if (Platform.OS !== 'web' || !sdkLoaded || !mapContainerRef.current || !isKeyConfigured) return;

    const maptilersdk = (window as any).maptilersdk;
    if (!maptilersdk) return;

    maptilersdk.config.apiKey = apiKey;

    const centerLon = searchCoordinates ? searchCoordinates.longitude : (userLon || -117.8443);
    const centerLat = searchCoordinates ? searchCoordinates.latitude : (userLat || 33.6405);

    const map = new maptilersdk.Map({
      container: mapContainerRef.current,
      style: customStyle
        ? `https://api.maptiler.com/maps/${customStyle}/style.json?key=${apiKey}`
        : maptilersdk.MapStyle.STREETS,
      center: [centerLon, centerLat],
      zoom: 13,
      navigationControl: true,
      geolocateControl: true,
    });

    mapRef.current = map;

    if (userLon && userLat) {
      new maptilersdk.Marker({ color: '#3B82F6' })
        .setLngLat([userLon, userLat])
        .setPopup(new maptilersdk.Popup({ offset: 25 }).setHTML('<h4 style="margin: 0; font-family: system-ui;">My Location</h4>'))
        .addTo(map);
    }

    const markers: any[] = [];
    webMarkersRef.current = [];
    cafes.forEach((cafe, index) => {
      const popupHtml = `
        <div style="font-family: 'Lora_400Regular', Georgia, serif; padding: 4px; color: ${themeColors.text}; background: ${themeColors.bg};">
          <h4 style="margin: 0 0 4px 0; font-family: 'CormorantGaramond_600SemiBold', serif; font-size: 17px; font-weight: normal;">${cafe.name}</h4>
          <p style="margin: 0 0 8px 0; font-size: 11px; color: ${themeColors.textMuted};">${cafe.address}</p>
          <div style="display: flex; gap: 6px;">
            <button id="details-btn-${cafe.id}" style="
              flex: 1;
              background-color: transparent;
              color: ${themeColors.text};
              border: 1px solid ${themeColors.hairlineStrong};
              padding: 8px 8px;
              border-radius: 4px;
              font-size: 10px;
              letter-spacing: 0.06em;
              text-transform: uppercase;
              cursor: pointer;
            ">Details</button>
            <button id="directions-btn-${cafe.id}" style="
              flex: 1;
              background-color: transparent;
              color: ${themeColors.accent700};
              border: 1px solid ${themeColors.accent};
              padding: 8px 8px;
              border-radius: 4px;
              font-size: 10px;
              letter-spacing: 0.06em;
              text-transform: uppercase;
              cursor: pointer;
            ">Directions</button>
          </div>
        </div>
      `;

      const popup = new maptilersdk.Popup({ offset: 25 }).setHTML(popupHtml);

      popup.on('open', () => {
        const btn = document.getElementById(`details-btn-${cafe.id}`);
        if (btn) {
          btn.addEventListener('click', () => {
            onSelectCafe(cafe.id);
          });
        }
        const dirBtn = document.getElementById(`directions-btn-${cafe.id}`);
        if (dirBtn) {
          dirBtn.addEventListener('click', () => {
            openCafeDirections(cafe, { latitude: userLat, longitude: userLon });
          });
        }
      });

      let markerImgUrl = '';
      try {
        const source = require('../../assets/images/coffee_marker.png');
        markerImgUrl = typeof source === 'string' ? source : (source.uri || source.default || '');
      } catch (e) {
        console.error('Failed to resolve coffee marker image', e);
      }

      const isActive = index === activeCafeIndex;

      // Pin is just the coffee cup icon — no card, no label.
      const el = document.createElement('div');
      el.className = 'custom-web-marker';
      el.style.display = 'flex';
      el.style.alignItems = 'center';
      el.style.justifyContent = 'center';
      el.style.cursor = 'pointer';

      const img = document.createElement('img');
      img.src = markerImgUrl || '/assets/images/coffee_marker.png';
      img.style.width = '28px';
      img.style.height = '28px';
      img.style.objectFit = 'contain';
      el.appendChild(img);

      if (isActive) {
        el.style.zIndex = '999';
      }

      const marker = new maptilersdk.Marker({ element: el })
        .setLngLat([cafe.longitude, cafe.latitude])
        .setPopup(popup)
        .addTo(map);

      const markerEl = marker.getElement();
      if (markerEl) {
        markerEl.style.cursor = 'pointer';
        markerEl.addEventListener('click', () => {
          selectMarker(index);
        });
      }

      markers.push(marker);
    });
    webMarkersRef.current = markers;

    if (cafes.length > 0) {
      const bounds = new maptilersdk.LngLatBounds();
      if (userLon && userLat) {
        bounds.extend([userLon, userLat]);
      }
      cafes.forEach((cafe) => {
        bounds.extend([cafe.longitude, cafe.latitude]);
      });
      map.fitBounds(bounds, { padding: 80, maxZoom: 15 });
    }

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      webMarkersRef.current = [];
    };
  }, [sdkLoaded, cafes, userLat, userLon]);

  // Pans the map to whichever café sits at `index`, once the carousel has
  // actually settled there.
  const settleOnIndex = (index: number) => {
    if (index < 0 || index >= cafes.length || index === activeCafeIndex) return;
    setActiveCafeIndex(index);
    const activeCafe = cafes[index];
    if (!activeCafe) return;
    if (Platform.OS !== 'web' && mapRef.current) {
      mapRef.current.animateToRegion(
        {
          latitude: activeCafe.latitude,
          longitude: activeCafe.longitude,
          latitudeDelta: 0.015,
          longitudeDelta: 0.015,
        },
        220
      );
    } else if (Platform.OS === 'web' && mapRef.current) {
      mapRef.current.flyTo({
        center: [activeCafe.longitude, activeCafe.latitude],
        zoom: 14.5,
        duration: 450,
        essential: true,
      });
    }
  };

  // react-native-web's ScrollView never actually fires onMomentumScrollEnd —
  // it's declared in its prop types but never invoked, so that's a dead
  // listener on web. Debouncing onScroll ourselves (reading the position
  // shortly after scroll events stop) gives the same "wait for it to actually
  // settle" behavior on every platform, web included. Kept short enough to
  // feel responsive but still comfortably longer than the gap between scroll
  // events during an active swipe, so it won't fire mid-scroll.
  const scrollSettleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCardScroll = (event: any) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    if (scrollSettleTimer.current) clearTimeout(scrollSettleTimer.current);
    scrollSettleTimer.current = setTimeout(() => {
      settleOnIndex(Math.round(offsetX / SLIDE_SIZE));
    }, 70);
  };

  useEffect(() => {
    return () => {
      if (scrollSettleTimer.current) clearTimeout(scrollSettleTimer.current);
    };
  }, []);

  const selectMarker = (index: number) => {
    setActiveCafeIndex(index);
    if (listRef.current) {
      // scrollToOffset with the same SLIDE_SIZE math settleOnIndex reads back —
      // scrollToIndex's viewPosition centering used a different offset formula
      // than the swipe-snap layout, so the settle handler would read back the
      // wrong index after a pin tap and re-pan the map to the wrong café.
      listRef.current.scrollToOffset({
        offset: index * SLIDE_SIZE,
        animated: true,
      });
    }

    // Fly to marker location on web if clicked
    if (Platform.OS === 'web' && mapRef.current && cafes[index]) {
      mapRef.current.flyTo({
        center: [cafes[index].longitude, cafes[index].latitude],
        zoom: 14.5,
        duration: 450,
        essential: true,
      });
    }
  };

  // Handle Search Coordinates on Web Map
  useEffect(() => {
    if (Platform.OS !== 'web' || !sdkLoaded || !mapRef.current) return;

    const maptilersdk = (window as any).maptilersdk;
    if (!maptilersdk) return;

    const map = mapRef.current;

    // 1. Remove existing search marker
    if (searchMarkerRef.current) {
      searchMarkerRef.current.remove();
      searchMarkerRef.current = null;
    }

    // 2. Add new search marker if coordinates exist
    if (searchCoordinates) {
      const { latitude, longitude, displayName } = searchCoordinates;
      
      const popup = new maptilersdk.Popup({ offset: 25 })
        .setHTML(`<div style="font-family: system-ui; padding: 4px; font-weight: bold; font-size: 13px;">Searched Location:<br/><span style="font-weight: normal; font-size: 11px; color: #8C7C73;">${displayName || 'Geocoded Address'}</span></div>`);

      const marker = new maptilersdk.Marker({ color: '#D97706' })
        .setLngLat([longitude, latitude])
        .setPopup(popup)
        .addTo(map);

      searchMarkerRef.current = marker;

      // Pan map to search results
      map.flyTo({
        center: [longitude, latitude],
        zoom: 13,
        essential: true,
      });
    } else {
      // If search coordinates cleared, pan back to user's location
      const centerLon = userLon || -117.8443;
      const centerLat = userLat || 33.6405;
      map.flyTo({
        center: [centerLon, centerLat],
        zoom: 13,
        essential: true,
      });
    }
  }, [searchCoordinates, sdkLoaded, userLat, userLon]);

  // Handle Active Route Polyline & Bounds on Web Map
  useEffect(() => {
    if (Platform.OS !== 'web' || !sdkLoaded || !mapRef.current) return;

    const map = mapRef.current;
    const maptilersdk = (window as any).maptilersdk;

    if (!map || !maptilersdk) return;

    // Remove existing layer and source if present
    if (map.getLayer('route-layer')) {
      map.removeLayer('route-layer');
    }
    if (map.getSource('route-source')) {
      map.removeSource('route-source');
    }

    if (activeRoute && activeRoute.coordinates && activeRoute.coordinates.length > 0) {
      const lineCoords = activeRoute.coordinates.map((c) => [c.longitude, c.latitude]);

      map.addSource('route-source', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: lineCoords,
          },
        },
      });

      map.addLayer({
        id: 'route-layer',
        type: 'line',
        source: 'route-source',
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
        paint: {
          'line-color': themeColors.accent700,
          'line-width': 5,
          'line-opacity': 0.9,
        },
      });

      // Fit map viewport to include entire route
      const bounds = new maptilersdk.LngLatBounds();
      lineCoords.forEach((pt: any) => bounds.extend(pt as [number, number]));
      map.fitBounds(bounds, { padding: 80, maxZoom: 16 });
    }
  }, [activeRoute, sdkLoaded, themeColors.accent700]);

  // Handle Active Route Camera Bounds on Native Map
  useEffect(() => {
    if (Platform.OS === 'web' || !mapRef.current) return;

    if (activeRoute && activeRoute.coordinates && activeRoute.coordinates.length > 0) {
      mapRef.current.fitToCoordinates(activeRoute.coordinates, {
        edgePadding: { top: 80, right: 50, bottom: 180, left: 50 },
        animated: true,
      });
    }
  }, [activeRoute]);

  const prevSearchingRef = useRef(isSearching);

  // Handle Search Coordinates or Reset on Map
  useEffect(() => {
    if (!mapRef.current) return;

    const wasSearching = prevSearchingRef.current;
    prevSearchingRef.current = isSearching;

    if (isSearching && cafes.length > 0) {
      const topCafe = cafes[0];
      if (Platform.OS !== 'web') {
        mapRef.current.animateToRegion(
          {
            latitude: topCafe.latitude,
            longitude: topCafe.longitude,
            latitudeDelta: 0.015,
            longitudeDelta: 0.015,
          },
          800
        );
      } else if (mapRef.current.flyTo) {
        mapRef.current.flyTo({
          center: [topCafe.longitude, topCafe.latitude],
          zoom: 15,
          essential: true,
        });
      }
    } else if (wasSearching && !isSearching) {
      const centerLat = userLat || 33.6405;
      const centerLon = userLon || -117.8443;
      if (Platform.OS !== 'web') {
        mapRef.current.animateToRegion(
          {
            latitude: centerLat,
            longitude: centerLon,
            latitudeDelta: 0.04,
            longitudeDelta: 0.04,
          },
          800
        );
      } else if (mapRef.current.flyTo) {
        mapRef.current.flyTo({
          center: [centerLon, centerLat],
          zoom: 13,
          essential: true,
        });
      }
    }
  }, [isSearching, cafes, userLat, userLon]);

  // Synchronize web markers active state when activeCafeIndex changes
  useEffect(() => {
    if (Platform.OS !== 'web' || !mapRef.current || !webMarkersRef.current.length) return;
    
    webMarkersRef.current.forEach((marker, index) => {
      const el = marker.getElement();
      if (!el) return;
      el.style.zIndex = index === activeCafeIndex ? '999' : 'auto';
    });
  }, [activeCafeIndex, cafes]);

  // Fallback UI and interactive UI for Web
  if (Platform.OS === 'web') {
    if (!isKeyConfigured) {
      return (
        <View style={[styles.webContainer, { backgroundColor: themeColors.bg }]}>
          <View style={[styles.warningBanner, { backgroundColor: themeColors.accent100, borderColor: themeColors.accent }]}>
            <TriangleAlert size={20} color={themeColors.accent700} strokeWidth={1.7} />
            <Text style={[styles.warningText, { color: themeColors.accent700 }]}>
              Interactive Map key missing. Add <Text style={{ fontStyle: 'italic' }}>EXPO_PUBLIC_MAPTILER_API_KEY</Text> to your <Text style={{ fontStyle: 'italic' }}>.env</Text> file to enable the interactive map.
            </Text>
          </View>
          <View style={styles.webHeader}>
            <MapIcon size={28} color={themeColors.accent700} strokeWidth={1.6} />
            <Text style={[styles.webTitle, { color: themeColors.text }]}>Explore Map View (Static List)</Text>
          </View>
          <Text style={[styles.webDescription, { color: themeColors.textMuted }]}>
            Showing {cafes.length} café locations relative to your center point:
          </Text>
          
          <ScrollView style={styles.webCafeList}>
            {cafes.map((item, index) => {
              const distance = calculateDistance(userLat, userLon, item.latitude, item.longitude);
              const openStatus = getOpenStatus(hours[item.id] || []);
              const crowdLevel = crowdLevelNumber(item.current_crowd_level);

              return (
                <Pressable
                  key={item.id}
                  onPress={() => onSelectCafe(item.id)}
                  style={[
                    styles.webCard,
                    {
                      backgroundColor: themeColors.surface,
                      borderColor: index === activeCafeIndex ? themeColors.accent700 : themeColors.hairlineStrong,
                    },
                  ]}
                >
                  <View style={styles.webCardHeader}>
                    <Text style={[styles.webCardTitle, { color: themeColors.text }]} numberOfLines={1}>{item.name}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={[styles.webDistance, { color: themeColors.accent700 }]}>
                        {formatDistance(distance)}
                      </Text>
                      {onToggleFavorite && (
                        <Pressable
                          onPress={(e: any) => {
                            if (e) {
                              if (typeof e.stopPropagation === 'function') e.stopPropagation();
                              if (typeof e.preventDefault === 'function') e.preventDefault();
                            }
                            console.log('[Map Card Debug] Favorite pressed:', item.id, item.name);
                            onToggleFavorite(item.id);
                          }}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Heart
                            size={18}
                            strokeWidth={1.7}
                            color={favoriteIds.includes(item.id) ? themeColors.accent700 : themeColors.textLight}
                            fill={favoriteIds.includes(item.id) ? themeColors.accent700 : 'none'}
                          />
                        </Pressable>
                      )}
                    </View>
                  </View>
                  <Text style={[styles.webCardAddress, { color: themeColors.textMuted }]} numberOfLines={1}>
                    {item.address}
                  </Text>
                  <View style={styles.webRow}>
                    <CrowdMeter level={crowdLevel} size={6} />
                    <Text style={[styles.webSubText, { color: themeColors.textMuted }]}>
                      {crowdLevel}/10 · {crowdLabel(crowdLevel)} · {openStatus.isOpen ? 'Open' : 'Closed'}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      );
    }

    if (loadError) {
      return (
        <View style={[styles.webContainer, { backgroundColor: themeColors.bg, justifyContent: 'center', alignItems: 'center' }]}>
          <CloudOff size={48} color={themeColors.danger} strokeWidth={1.6} style={{ marginBottom: 12 }} />
          <Text style={[styles.webTitle, { color: themeColors.text, marginBottom: 8 }]}>Failed to load map library</Text>
          <Text style={[styles.webDescription, { color: themeColors.textMuted, textAlign: 'center' }]}>
            Please check your network connection and reload.
          </Text>
        </View>
      );
    }

    if (!sdkLoaded) {
      return (
        <View style={[styles.webContainer, { backgroundColor: themeColors.bg, justifyContent: 'center', alignItems: 'center' }]}>
          <ActivityIndicator size="large" color={themeColors.accent700} style={{ marginBottom: 12 }} />
          <Text style={[styles.webDescription, { color: themeColors.textMuted }]}>
            Loading interactive map...
          </Text>
        </View>
      );
    }

    // Render Web Map Container with floating carousel
    return (
      <View style={styles.container}>
        <View 
          ref={mapContainerRef} 
          style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }} 
        />
        
        {/* Floating Bottom Carousel Preview */}
        <View style={styles.carouselContainer}>
          <FlatList
            ref={listRef}
            horizontal
            pagingEnabled
            decelerationRate="fast"
            snapToInterval={SLIDE_SIZE}
            snapToAlignment="center"
            showsHorizontalScrollIndicator={false}
            data={cafes}
            keyExtractor={(item) => item.id}
            onScroll={onCardScroll}
            scrollEventThrottle={16}
            contentContainerStyle={{
              paddingHorizontal: (width - CARD_WIDTH) / 2 - CARD_SPACING,
            }}
            renderItem={({ item, index }) => {
              const distance = calculateDistance(userLat, userLon, item.latitude, item.longitude);
              const openStatus = getOpenStatus(hours[item.id] || []);
              const crowdLevel = crowdLevelNumber(item.current_crowd_level);

              return (
                <Pressable
                  onPress={() => onSelectCafe(item.id)}
                  style={({ pressed }) => [
                    styles.card,
                    {
                      backgroundColor: themeColors.surface,
                      borderColor: index === activeCafeIndex ? themeColors.accent700 : themeColors.hairlineStrong,
                    },
                    pressed && { opacity: 0.95 },
                  ]}
                >
                  <View style={styles.cardHeader}>
                    <Text style={[styles.cardTitle, { color: themeColors.text }]} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <View style={styles.cardHeaderRight}>
                      <Text style={[styles.cardDistance, { color: themeColors.accent700 }]}>
                        {formatDistance(distance)}
                      </Text>
                      {onToggleFavorite && (
                        <Pressable
                          onPress={(e: any) => {
                            if (e) {
                              if (typeof e.stopPropagation === 'function') e.stopPropagation();
                              if (typeof e.preventDefault === 'function') e.preventDefault();
                            }
                            console.log('[Map Card Debug] Favorite pressed:', item.id, item.name);
                            onToggleFavorite(item.id);
                          }}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Heart
                            size={18}
                            strokeWidth={1.7}
                            color={favoriteIds.includes(item.id) ? themeColors.accent700 : themeColors.textLight}
                            fill={favoriteIds.includes(item.id) ? themeColors.accent700 : 'none'}
                          />
                        </Pressable>
                      )}
                    </View>
                  </View>
                  <Text style={[styles.cardAddress, { color: themeColors.textMuted }]} numberOfLines={1}>
                    {item.address}
                  </Text>
                  <View style={styles.cardFooter}>
                    <View style={styles.crowdRow}>
                      <CrowdMeter level={crowdLevel} size={6} />
                      <Text style={styles.badgeText}>
                        {crowdLevel}/10 · {crowdLabel(crowdLevel)}
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.openStatus,
                        { color: openStatus.isOpen ? themeColors.accent700 : themeColors.textMuted },
                      ]}
                    >
                      {openStatus.isOpen ? 'Open Now' : 'Closed'}
                    </Text>
                  </View>
                </Pressable>
              );
            }}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Map View */}
      <MapView
        ref={mapRef}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        style={styles.map}
        initialRegion={initialRegion}
        showsUserLocation={true}
        showsMyLocationButton={true}
        // A muted, low-saturation ground so the map reads near-white behind the
        // warm-paper card chrome, per the design handoff.
        customMapStyle={[
          { elementType: 'geometry', stylers: [{ color: '#f3f2f2' }] },
          { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
          { elementType: 'labels.text.fill', stylers: [{ color: '#9b9797' }] },
          { elementType: 'labels.text.stroke', stylers: [{ color: '#f3f2f2' }] },
          { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
          { featureType: 'poi', stylers: [{ visibility: 'off' }] },
          { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#eae9e9' }] },
          { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#e0dede' }] },
          { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#9b9797' }] },
          { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#e3e0da' }] },
          { featureType: 'transit', stylers: [{ visibility: 'off' }] },
          { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#e6e4e4' }] },
        ]}
      >
        {/* User Marker if Fallback (mock GPS pin) */}
        <Marker
          coordinate={{ latitude: userLat, longitude: userLon }}
          title="My Location"
          pinColor="#3B82F6"
        />

        {/* Active Route Polyline */}
        {activeRoute && activeRoute.coordinates && activeRoute.coordinates.length > 0 && Polyline && (
          <Polyline
            coordinates={activeRoute.coordinates}
            strokeColor={themeColors.accent700}
            strokeWidth={5}
          />
        )}

        {/* Searched Location Marker */}
        {searchCoordinates && (
          <Marker
            coordinate={{ latitude: searchCoordinates.latitude, longitude: searchCoordinates.longitude }}
            title={searchCoordinates.displayName || "Searched Location"}
            pinColor="#D97706"
          />
        )}

        {/* Cafe Markers — just the coffee cup icon, no label */}
        {cafes.map((item, index) => (
          <Marker
            key={item.id}
            coordinate={{ latitude: item.latitude, longitude: item.longitude }}
            onPress={() => selectMarker(index)}
            tracksViewChanges={false}
            anchor={{ x: 0.5, y: 0.5 }}
            zIndex={index === activeCafeIndex ? 999 : 1}
          >
            <View style={{ alignItems: 'center', justifyContent: 'center' }}>
              <Image
                source={require('../../assets/images/coffee_marker.png')}
                style={{ width: 28, height: 28, resizeMode: 'contain' }}
              />
            </View>
          </Marker>
        ))}
      </MapView>

      {/* Floating Bottom Carousel Preview */}
      <View style={styles.carouselContainer}>
        <FlatList
          ref={listRef}
          horizontal
          pagingEnabled
          decelerationRate="fast"
          snapToInterval={SLIDE_SIZE}
          snapToAlignment="center"
          showsHorizontalScrollIndicator={false}
          data={cafes}
          keyExtractor={(item) => item.id}
          onScroll={onCardScroll}
          scrollEventThrottle={16}
          contentContainerStyle={{
            paddingHorizontal: Platform.OS === 'android' ? CARD_SPACING : (width - CARD_WIDTH) / 2 - CARD_SPACING,
          }}
          renderItem={({ item, index }) => {
            const distance = calculateDistance(userLat, userLon, item.latitude, item.longitude);
            const openStatus = getOpenStatus(hours[item.id] || []);
            const crowdLevel = crowdLevelNumber(item.current_crowd_level);

            return (
              <Pressable
                onPress={() => onSelectCafe(item.id)}
                style={({ pressed }) => [
                  styles.card,
                  {
                    backgroundColor: themeColors.surface,
                    borderColor: index === activeCafeIndex ? themeColors.accent700 : themeColors.hairlineStrong,
                  },
                  pressed && { opacity: 0.95 },
                ]}
              >
                <View style={styles.cardHeader}>
                  <Text style={[styles.cardTitle, { color: themeColors.text }]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <View style={styles.cardHeaderRight}>
                    <Text style={[styles.cardDistance, { color: themeColors.accent700 }]}>
                      {formatDistance(distance)}
                    </Text>
                    {onToggleFavorite && (
                      <Pressable
                        onPress={(e: any) => {
                          if (e) {
                            if (typeof e.stopPropagation === 'function') e.stopPropagation();
                            if (typeof e.preventDefault === 'function') e.preventDefault();
                          }
                          console.log('[Map Card Debug] Favorite pressed:', item.id, item.name);
                          onToggleFavorite(item.id);
                        }}
                        style={({ pressed }) => [
                          styles.mapCardHeartBtn,
                          pressed && { opacity: 0.7 },
                        ]}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Heart
                          size={18}
                          strokeWidth={1.7}
                          color={favoriteIds.includes(item.id) ? themeColors.accent700 : themeColors.textLight}
                          fill={favoriteIds.includes(item.id) ? themeColors.accent700 : 'none'}
                        />
                      </Pressable>
                    )}
                  </View>
                </View>
                <Text style={[styles.cardAddress, { color: themeColors.textMuted }]} numberOfLines={1}>
                  {item.address}
                </Text>
                <View style={styles.cardFooter}>
                  <View style={styles.crowdRow}>
                    <CrowdMeter level={crowdLevel} size={6} />
                    <Text style={styles.badgeText}>
                      {crowdLevel}/10 · {crowdLabel(crowdLevel)}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.openStatus,
                      { color: openStatus.isOpen ? themeColors.accent700 : themeColors.textMuted },
                    ]}
                  >
                    {openStatus.isOpen ? 'Open Now' : 'Closed'}
                  </Text>
                </View>
              </Pressable>
            );
          }}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: 'relative',
  },
  map: {
    width: '100%',
    height: '100%',
  },
  carouselContainer: {
    position: 'absolute',
    bottom: 24,
    left: 0,
    right: 0,
    paddingVertical: THEME.spacing.sm,
  },
  card: {
    width: CARD_WIDTH,
    marginHorizontal: CARD_SPACING,
    borderRadius: THEME.radius.md,
    borderWidth: 1,
    padding: THEME.spacing.md,
    ...THEME.shadow.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  cardHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  mapCardHeartBtn: {
    padding: 2,
  },
  cardTitle: {
    ...THEME.type.listTitle,
    flex: 1,
    marginRight: THEME.spacing.sm,
  },
  cardDistance: {
    ...THEME.type.meta,
  },
  cardAddress: {
    ...THEME.type.metaSmall,
    marginBottom: THEME.spacing.md,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  crowdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  badgeText: {
    ...THEME.type.metaSmall,
    color: THEME.colors.textSecondary,
  },
  openStatus: {
    ...THEME.type.kicker,
  },

  // Web Fallback styles
  webContainer: {
    flex: 1,
    padding: THEME.spacing.lg,
  },
  webHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: THEME.spacing.sm,
    marginBottom: THEME.spacing.sm,
  },
  webTitle: {
    ...THEME.type.cardTitle,
  },
  webDescription: {
    ...THEME.type.meta,
    marginBottom: THEME.spacing.md,
  },
  webCafeList: {
    flex: 1,
  },
  webCard: {
    borderWidth: 1,
    borderRadius: THEME.radius.md,
    padding: THEME.spacing.md,
    marginBottom: THEME.spacing.sm,
  },
  webCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  webCardTitle: {
    ...THEME.type.listTitle,
  },
  webDistance: {
    ...THEME.type.meta,
  },
  webCardAddress: {
    ...THEME.type.metaSmall,
    marginBottom: THEME.spacing.sm,
  },
  webRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  webSubText: {
    ...THEME.type.kicker,
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: THEME.spacing.md,
    borderRadius: THEME.radius.md,
    marginBottom: THEME.spacing.lg,
    borderWidth: 1,
    gap: THEME.spacing.sm,
  },
  warningText: {
    ...THEME.type.bodyTight,
    flex: 1,
  },
});
export default React.memo(MapContainer);
