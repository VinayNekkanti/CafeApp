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
  useColorScheme,
} from 'react-native';
import { Cafe, CafeHours } from '../types';
import { THEME } from '../constants/theme';
import { calculateDistance, formatDistance } from '../utils/distance';
import { openCafeDirections } from '../utils/directions';
import { RouteResult } from '../services/routing';
import { getOpenStatus } from '../utils/hours';
import Ionicons from '@expo/vector-icons/Ionicons';

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
  const colorScheme = (useColorScheme() ?? 'light') as 'light' | 'dark';
  const themeColors = THEME.colors[colorScheme];

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
        : (colorScheme === 'dark' ? maptilersdk.MapStyle.DARK : maptilersdk.MapStyle.STREETS),
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
      const color = getCrowdMarkerColor(cafe.current_crowd_level);
      
      const popupHtml = `
        <div style="font-family: system-ui, sans-serif; padding: 4px; color: ${colorScheme === 'dark' ? '#fff' : '#000'}; background: ${colorScheme === 'dark' ? '#1E120E' : '#fff'};">
          <h4 style="margin: 0 0 4px 0; font-size: 14px; font-weight: bold;">${cafe.name}</h4>
          <p style="margin: 0 0 8px 0; font-size: 11px; color: #8C7C73;">${cafe.address}</p>
          <div style="display: flex; gap: 6px;">
            <button id="details-btn-${cafe.id}" style="
              flex: 1;
              background-color: ${themeColors.surfaceMuted};
              color: ${themeColors.text};
              border: 1px solid ${themeColors.border};
              padding: 6px 8px;
              border-radius: 6px;
              font-size: 11px;
              font-weight: bold;
              cursor: pointer;
            ">View Details</button>
            <button id="directions-btn-${cafe.id}" style="
              flex: 1;
              background-color: ${themeColors.primary};
              color: #fff;
              border: none;
              padding: 6px 8px;
              border-radius: 6px;
              font-size: 11px;
              font-weight: bold;
              cursor: pointer;
            ">Get Directions</button>
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

      // Create a custom element for the marker on Web (only containing the coffee cup image)
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
      
      const isActive = index === activeCafeIndex;
      if (isActive) {
        el.style.zIndex = '999';
      }
      
      el.appendChild(img);

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
  }, [sdkLoaded, cafes, userLat, userLon, colorScheme]);

  // Synchronize map focus when selecting a cafe card
  const onCardScroll = (event: any) => {
    const slideSize = CARD_WIDTH + CARD_SPACING * 2;
    const index = Math.round(event.nativeEvent.contentOffset.x / slideSize);
    
    if (index >= 0 && index < cafes.length && index !== activeCafeIndex) {
      setActiveCafeIndex(index);
      const activeCafe = cafes[index];
      if (activeCafe) {
        if (Platform.OS !== 'web' && mapRef.current) {
          mapRef.current.animateToRegion(
            {
              latitude: activeCafe.latitude,
              longitude: activeCafe.longitude,
              latitudeDelta: 0.015,
              longitudeDelta: 0.015,
            },
            350
          );
        } else if (Platform.OS === 'web' && mapRef.current) {
          mapRef.current.flyTo({
            center: [activeCafe.longitude, activeCafe.latitude],
            zoom: 14.5,
            essential: true,
          });
        }
      }
    }
  };

  const selectMarker = (index: number) => {
    setActiveCafeIndex(index);
    if (listRef.current) {
      listRef.current.scrollToIndex({
        index,
        animated: true,
        viewPosition: 0.5,
      });
    }
    
    // Fly to marker location on web if clicked
    if (Platform.OS === 'web' && mapRef.current && cafes[index]) {
      mapRef.current.flyTo({
        center: [cafes[index].longitude, cafes[index].latitude],
        zoom: 14.5,
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
          'line-color': themeColors.primary,
          'line-width': 5,
          'line-opacity': 0.9,
        },
      });

      // Fit map viewport to include entire route
      const bounds = new maptilersdk.LngLatBounds();
      lineCoords.forEach((pt: any) => bounds.extend(pt as [number, number]));
      map.fitBounds(bounds, { padding: 80, maxZoom: 16 });
    }
  }, [activeRoute, sdkLoaded, themeColors.primary]);

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
      if (el) {
        if (index === activeCafeIndex) {
          el.style.zIndex = '999';
        } else {
          el.style.zIndex = 'auto';
        }
      }
    });
  }, [activeCafeIndex, cafes]);

  const getCrowdMarkerColor = (crowd?: string | null) => {
    if (crowd === 'Low') return '#10B981'; // Green
    if (crowd === 'Moderate') return '#F59E0B'; // Orange
    if (crowd === 'Busy') return '#EF4444'; // Red
    if (crowd === 'Full') return '#7F1D1D'; // Maroon
    return '#6E5D53'; // Default Gray
  };

  // Fallback UI and interactive UI for Web
  if (Platform.OS === 'web') {
    if (!isKeyConfigured) {
      return (
        <View style={[styles.webContainer, { backgroundColor: themeColors.background }]}>
          <View style={[styles.warningBanner, { backgroundColor: themeColors.warningLight, borderColor: themeColors.warning }]}>
            <Ionicons name="warning" size={20} color={themeColors.warning} />
            <Text style={[styles.warningText, { color: themeColors.warning }]}>
              Interactive Map key missing. Add <Text style={{ fontWeight: 'bold' }}>EXPO_PUBLIC_MAPTILER_API_KEY</Text> to your <Text style={{ fontWeight: 'bold' }}>.env</Text> file to enable the interactive map.
            </Text>
          </View>
          <View style={styles.webHeader}>
            <Ionicons name="map-outline" size={28} color={themeColors.primary} />
            <Text style={[styles.webTitle, { color: themeColors.text }]}>Explore Map View (Static List)</Text>
          </View>
          <Text style={[styles.webDescription, { color: themeColors.textMuted }]}>
            Showing {cafes.length} café locations relative to your center point:
          </Text>
          
          <ScrollView style={styles.webCafeList}>
            {cafes.map((item, index) => {
              const distance = calculateDistance(userLat, userLon, item.latitude, item.longitude);
              const openStatus = getOpenStatus(hours[item.id] || []);
              const color = getCrowdMarkerColor(item.current_crowd_level);

              return (
                <Pressable
                  key={item.id}
                  onPress={() => onSelectCafe(item.id)}
                  style={[
                    styles.webCard,
                    {
                      backgroundColor: themeColors.surface,
                      borderColor: index === activeCafeIndex ? themeColors.primary : themeColors.border,
                    },
                  ]}
                >
                  <View style={styles.webCardHeader}>
                    <Text style={[styles.webCardTitle, { color: themeColors.text }]} numberOfLines={1}>{item.name}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={[styles.webDistance, { color: themeColors.primaryLight }]}>
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
                          <Ionicons
                            name={favoriteIds.includes(item.id) ? 'heart' : 'heart-outline'}
                            size={18}
                            color={favoriteIds.includes(item.id) ? '#EF4444' : themeColors.textMuted}
                          />
                        </Pressable>
                      )}
                    </View>
                  </View>
                  <Text style={[styles.webCardAddress, { color: themeColors.textMuted }]} numberOfLines={1}>
                    {item.address}
                  </Text>
                  <View style={styles.webRow}>
                    <View style={[styles.bullet, { backgroundColor: color }]} />
                    <Text style={[styles.webSubText, { color: themeColors.textMuted }]}>
                      {item.current_crowd_level || 'Low'} Crowd • {openStatus.isOpen ? 'Open' : 'Closed'}
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
        <View style={[styles.webContainer, { backgroundColor: themeColors.background, justifyContent: 'center', alignItems: 'center' }]}>
          <Ionicons name="cloud-offline-outline" size={48} color={themeColors.danger} style={{ marginBottom: 12 }} />
          <Text style={[styles.webTitle, { color: themeColors.text, marginBottom: 8 }]}>Failed to load map library</Text>
          <Text style={[styles.webDescription, { color: themeColors.textMuted, textAlign: 'center' }]}>
            Please check your network connection and reload.
          </Text>
        </View>
      );
    }

    if (!sdkLoaded) {
      return (
        <View style={[styles.webContainer, { backgroundColor: themeColors.background, justifyContent: 'center', alignItems: 'center' }]}>
          <ActivityIndicator size="large" color={themeColors.primary} style={{ marginBottom: 12 }} />
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
            snapToInterval={CARD_WIDTH + CARD_SPACING * 2}
            snapToAlignment="center"
            showsHorizontalScrollIndicator={false}
            data={cafes}
            keyExtractor={(item) => item.id}
            onScroll={onCardScroll}
            scrollEventThrottle={32}
            contentContainerStyle={{
              paddingHorizontal: (width - CARD_WIDTH) / 2 - CARD_SPACING,
            }}
            renderItem={({ item, index }) => {
              const distance = calculateDistance(userLat, userLon, item.latitude, item.longitude);
              const openStatus = getOpenStatus(hours[item.id] || []);
              const crowdColor = getCrowdMarkerColor(item.current_crowd_level);

              return (
                <Pressable
                  onPress={() => onSelectCafe(item.id)}
                  style={({ pressed }) => [
                    styles.card,
                    {
                      backgroundColor: themeColors.surface,
                      borderColor: index === activeCafeIndex ? themeColors.primary : themeColors.border,
                    },
                    pressed && { opacity: 0.95 },
                  ]}
                >
                  <View style={styles.cardHeader}>
                    <Text style={[styles.cardTitle, { color: themeColors.text }]} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <View style={styles.cardHeaderRight}>
                      <Text style={[styles.cardDistance, { color: themeColors.primaryLight }]}>
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
                          <Ionicons
                            name={favoriteIds.includes(item.id) ? 'heart' : 'heart-outline'}
                            size={18}
                            color={favoriteIds.includes(item.id) ? '#EF4444' : themeColors.textMuted}
                          />
                        </Pressable>
                      )}
                    </View>
                  </View>
                  <Text style={[styles.cardAddress, { color: themeColors.textMuted }]} numberOfLines={1}>
                    {item.address}
                  </Text>
                  <View style={styles.cardFooter}>
                    <View style={[styles.badge, { backgroundColor: crowdColor + '1F' }]}>
                      <Text style={[styles.badgeText, { color: crowdColor }]}>
                        {item.current_crowd_level || 'Low'} Crowd
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.openStatus,
                        { color: openStatus.isOpen ? themeColors.success : themeColors.danger },
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
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        initialRegion={initialRegion}
        showsUserLocation={true}
        showsMyLocationButton={true}
        customMapStyle={
          colorScheme === 'dark'
            ? [
                {
                  elementType: 'geometry',
                  stylers: [{ color: '#242f3e' }],
                },
                {
                  elementType: 'labels.text.fill',
                  stylers: [{ color: '#746855' }],
                },
                {
                  elementType: 'labels.text.stroke',
                  stylers: [{ color: '#242f3e' }],
                },
                {
                  featureType: 'administrative.locality',
                  elementType: 'labels.text.fill',
                  stylers: [{ color: '#d59563' }],
                },
                {
                  featureType: 'road',
                  elementType: 'geometry',
                  stylers: [{ color: '#38414e' }],
                },
                {
                  featureType: 'road',
                  elementType: 'labels.text.fill',
                  stylers: [{ color: '#9ca5b3' }],
                },
                {
                  featureType: 'water',
                  elementType: 'geometry',
                  stylers: [{ color: '#17263c' }],
                },
              ]
            : []
        }
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
            strokeColor={themeColors.primary}
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

        {/* Cafe Markers */}
        {cafes.map((item, index) => {
          const isActive = index === activeCafeIndex;

          return (
            <Marker
              key={item.id}
              coordinate={{ latitude: item.latitude, longitude: item.longitude }}
              onPress={() => selectMarker(index)}
              tracksViewChanges={false}
              anchor={{ x: 0.5, y: 0.5 }}
              zIndex={isActive ? 999 : 1}
            >
              <View style={{
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <Image
                  source={require('../../assets/images/coffee_marker.png')}
                  style={{
                    width: 28,
                    height: 28,
                    resizeMode: 'contain',
                  }}
                />
              </View>
            </Marker>
          );
        })}
      </MapView>

      {/* Floating Bottom Carousel Preview */}
      <View style={styles.carouselContainer}>
        <FlatList
          ref={listRef}
          horizontal
          pagingEnabled
          decelerationRate="fast"
          snapToInterval={CARD_WIDTH + CARD_SPACING * 2}
          snapToAlignment="center"
          showsHorizontalScrollIndicator={false}
          data={cafes}
          keyExtractor={(item) => item.id}
          onScroll={onCardScroll}
          scrollEventThrottle={32}
          contentContainerStyle={{
            paddingHorizontal: Platform.OS === 'android' ? CARD_SPACING : (width - CARD_WIDTH) / 2 - CARD_SPACING,
          }}
          renderItem={({ item, index }) => {
            const distance = calculateDistance(userLat, userLon, item.latitude, item.longitude);
            const openStatus = getOpenStatus(hours[item.id] || []);
            const crowdColor = getCrowdMarkerColor(item.current_crowd_level);

            return (
              <Pressable
                onPress={() => onSelectCafe(item.id)}
                style={({ pressed }) => [
                  styles.card,
                  {
                    backgroundColor: themeColors.surface,
                    borderColor: index === activeCafeIndex ? themeColors.primary : themeColors.border,
                  },
                  pressed && { opacity: 0.95 },
                ]}
              >
                <View style={styles.cardHeader}>
                  <Text style={[styles.cardTitle, { color: themeColors.text }]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <View style={styles.cardHeaderRight}>
                    <Text style={[styles.cardDistance, { color: themeColors.primaryLight }]}>
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
                        <Ionicons
                          name={favoriteIds.includes(item.id) ? 'heart' : 'heart-outline'}
                          size={18}
                          color={favoriteIds.includes(item.id) ? '#EF4444' : themeColors.textMuted}
                        />
                      </Pressable>
                    )}
                  </View>
                </View>
                <Text style={[styles.cardAddress, { color: themeColors.textMuted }]} numberOfLines={1}>
                  {item.address}
                </Text>
                <View style={styles.cardFooter}>
                  <View style={[styles.badge, { backgroundColor: crowdColor + '1F' }]}>
                    <Text style={[styles.badgeText, { color: crowdColor }]}>
                      {item.current_crowd_level || 'Low'} Crowd
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.openStatus,
                      { color: openStatus.isOpen ? themeColors.success : themeColors.danger },
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
  customPin: {
    padding: 4,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  activeDot: {
    position: 'absolute',
    bottom: -6,
    width: 6,
    height: 6,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: '#FFF',
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
    borderRadius: THEME.roundness.md,
    borderWidth: 1.5,
    padding: THEME.spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
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
    fontSize: THEME.typography.sizes.sm,
    fontWeight: 'bold',
    flex: 1,
    marginRight: THEME.spacing.sm,
  },
  cardDistance: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  cardAddress: {
    fontSize: 10,
    marginBottom: THEME.spacing.md,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: THEME.roundness.sm,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: 'bold',
  },
  openStatus: {
    fontSize: 10,
    fontWeight: 'bold',
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
    fontSize: THEME.typography.sizes.md,
    fontWeight: 'bold',
  },
  webDescription: {
    fontSize: THEME.typography.sizes.xs,
    marginBottom: THEME.spacing.md,
  },
  webCafeList: {
    flex: 1,
  },
  webCard: {
    borderWidth: 1,
    borderRadius: THEME.roundness.md,
    padding: THEME.spacing.md,
    marginBottom: THEME.spacing.sm,
  },
  webCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  webCardTitle: {
    fontSize: THEME.typography.sizes.sm,
    fontWeight: 'bold',
  },
  webDistance: {
    fontSize: THEME.typography.sizes.xs,
    fontWeight: 'bold',
  },
  webCardAddress: {
    fontSize: 11,
    marginBottom: THEME.spacing.sm,
  },
  webRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  bullet: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  webSubText: {
    fontSize: 10,
    fontWeight: '500',
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: THEME.spacing.md,
    borderRadius: THEME.roundness.md,
    marginBottom: THEME.spacing.lg,
    borderWidth: 1,
    gap: THEME.spacing.sm,
  },
  warningText: {
    fontSize: 12,
    lineHeight: 18,
    flex: 1,
  },
});
export default React.memo(MapContainer);
