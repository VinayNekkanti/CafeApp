import React, { useCallback, useState } from 'react';
import { FlatList, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Heart, Briefcase, ChevronRight } from 'lucide-react-native';
import { useAuth } from '../../src/context/AuthContext';
import { useLocation } from '../../src/context/LocationContext';
import { getCafes, getCafeHoursBatch, getFavorites, toggleFavorite } from '../../src/services/data';
import { Cafe, CafeHours } from '../../src/types';
import { THEME, crowdLevelNumber } from '../../src/constants/theme';
import { Divider, Kicker, OutlineButton, Plate } from '../../src/components/classical';
import { calculateDistance, formatDistance } from '../../src/utils/distance';
import LoadingScreen from '../../src/components/LoadingScreen';

const { colors: C, spacing: SPACING, type: TYPE } = THEME;

/** The 52px favorites row — see design handoff README, "5. Profile / Favorites". */
function FavoriteRow({ cafe, userLat, userLon, onRemove, onPress }: {
  cafe: Cafe;
  userLat: number;
  userLon: number;
  onRemove: () => void;
  onPress: () => void;
}) {
  const distanceMiles = calculateDistance(userLat, userLon, cafe.latitude, cafe.longitude);
  const crowdLevel = crowdLevelNumber(cafe.current_crowd_level);

  return (
    <Pressable onPress={onPress} style={styles.favRow}>
      <Plate size={52} source={cafe.image_url ? { uri: cafe.image_url } : null} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[TYPE.cardTitle, { fontSize: 21, color: C.text }]} numberOfLines={1}>{cafe.name}</Text>
        <Text style={[TYPE.meta, { color: C.textMuted, marginTop: 2 }]} numberOfLines={1}>
          {formatDistance(distanceMiles)} · {cafe.address.split(',')[0]} · {crowdLevel}/10 crowd
        </Text>
      </View>
      <Pressable onPress={onRemove} hitSlop={8} style={styles.favHeartBtn}>
        <Heart size={16} strokeWidth={1.7} color={C.accent700} fill={C.accent700} />
      </Pressable>
    </Pressable>
  );
}

export default function ProfileScreen() {
  const router = useRouter();
  const { user, profile, loading: authLoading, signOut } = useAuth();
  const { location } = useLocation();

  const [favoriteCafes, setFavoriteCafes] = useState<Cafe[]>([]);
  const [hours, setHours] = useState<Record<string, CafeHours[]>>({});
  const [loadingFavorites, setLoadingFavorites] = useState(false);
  const [employeeAssignment, setEmployeeAssignment] = useState<any>(null);

  const fetchFavorites = async () => {
    if (!user) return;
    setLoadingFavorites(true);
    try {
      const favIds = await getFavorites(user.id);
      const cafesList = await getCafes();
      const favList = cafesList.filter((c) => favIds.includes(c.id));
      setFavoriteCafes(favList);

      if (favList.length > 0) {
        const hoursMap = await getCafeHoursBatch(favList.map((c) => c.id));
        setHours(hoursMap);
      }
    } catch (err) {
      console.error('Error fetching favorites:', err);
    } finally {
      setLoadingFavorites(false);
    }
  };

  const checkEmployee = async () => {
    if (!user) {
      setEmployeeAssignment(null);
      return;
    }
    const { getEmployeeAssignment } = await import('../../src/services/data');
    const emp = await getEmployeeAssignment();
    setEmployeeAssignment(emp);
  };

  const handleRemoveFavorite = async (cafeId: string) => {
    if (!user) return;
    setFavoriteCafes((prev) => prev.filter((c) => c.id !== cafeId));
    try {
      await toggleFavorite(user.id, cafeId, false);
    } catch (err) {
      console.error('Failed to remove favorite:', err);
      fetchFavorites();
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchFavorites();
      checkEmployee();
    }, [user])
  );

  const handleLogout = async () => {
    try {
      await signOut();
    } catch (err) {
      console.error('Failed to log out:', err);
    }
  };

  if (authLoading) {
    return <LoadingScreen message="Checking authentication state..." />;
  }

  // Signed out
  if (!user) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.signedOutWrap}>
          <View style={styles.signedOutIconCircle}>
            <Heart size={22} color={C.accent700} strokeWidth={1.5} />
          </View>
          <Text style={[TYPE.screenTitle, { fontSize: 30, color: C.text, marginTop: SPACING.lg }]}>
            Save your spots
          </Text>
          <Text style={[TYPE.body, styles.signedOutBody]}>
            A free student profile keeps your favorites, your noise ratings and the notes you leave for other students.
          </Text>
          <OutlineButton
            label="Sign In / Create Account"
            onPress={() => router.push('/auth')}
            style={{ width: '100%', marginTop: SPACING.lg }}
          />
        </View>
      </SafeAreaView>
    );
  }

  // Signed in
  const displayName =
    profile?.display_name?.trim() ||
    [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim() ||
    (user.email ? user.email.split('@')[0] : 'User');
  const initial = (profile?.first_name?.trim() || profile?.display_name?.trim() || user.email || 'U').charAt(0).toUpperCase();

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={favoriteCafes}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View>
            <Text style={[TYPE.screenTitle, { color: C.text, paddingHorizontal: SPACING.screen, paddingTop: 4 }]}>Profile</Text>
            <Divider style={{ marginTop: SPACING.md, marginHorizontal: SPACING.screen }} />

            <View style={[styles.identityRow, { paddingHorizontal: SPACING.screen }]}>
              <View style={styles.avatarCircle}>
                <Text style={styles.avatarLetter}>{initial}</Text>
              </View>
              <View>
                <Text style={[TYPE.cardTitle, { fontSize: 24, color: C.text }]}>{displayName}</Text>
                <Text style={[TYPE.meta, { color: C.textMuted, marginTop: 3 }]}>{user.email}</Text>
              </View>
            </View>
            <Divider style={{ marginHorizontal: SPACING.screen }} />

            {employeeAssignment && (
              <Pressable onPress={() => router.push('/employee/dashboard')} style={[styles.employeeRow, { paddingHorizontal: SPACING.screen }]}>
                <Briefcase size={18} color={C.accent700} strokeWidth={1.7} />
                <View style={{ flex: 1 }}>
                  <Text style={[TYPE.bodyTight, { color: C.text }]}>Employee Portal</Text>
                  <Text style={[TYPE.metaSmall, { color: C.textMuted }]}>Update live crowd for {employeeAssignment.cafe_name}</Text>
                </View>
                <ChevronRight size={16} color={C.accent700} strokeWidth={1.8} />
              </Pressable>
            )}

            <Kicker style={{ paddingHorizontal: SPACING.screen, paddingTop: SPACING.lg, paddingBottom: 4 }}>
              Favorites
            </Kicker>
          </View>
        }
        renderItem={({ item }) => (
          <View style={{ paddingHorizontal: SPACING.screen }}>
            <FavoriteRow
              cafe={item}
              userLat={location.latitude}
              userLon={location.longitude}
              onRemove={() => handleRemoveFavorite(item.id)}
              onPress={() => router.push(`/cafe/${item.id}`)}
            />
          </View>
        )}
        ListEmptyComponent={
          loadingFavorites ? (
            <Text style={[TYPE.bodyTight, { color: C.textMuted, paddingHorizontal: SPACING.screen, paddingTop: SPACING.lg }]}>
              Fetching saved spots…
            </Text>
          ) : (
            <View style={[styles.emptyFavRow, { marginHorizontal: SPACING.screen }]}>
              <Text style={[TYPE.bodyTight, { color: C.textMuted }]}>No saved spots yet. Tap the heart on any café.</Text>
            </View>
          )
        }
        ListFooterComponent={
          <View style={{ paddingHorizontal: SPACING.screen, paddingTop: SPACING.xl }}>
            <Kicker>Account</Kicker>
            <OutlineButton label="Sign Out" variant="secondary" onPress={handleLogout} style={{ width: '100%', marginTop: SPACING.sm }} />
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  listContent: { paddingBottom: 40 },
  signedOutWrap: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 64,
    paddingHorizontal: SPACING.screen,
  },
  signedOutIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signedOutBody: {
    color: C.textSecondary,
    textAlign: 'center',
    maxWidth: 280,
    marginTop: SPACING.sm,
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.lg,
  },
  avatarCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    fontFamily: THEME.fonts.display,
    fontSize: 26,
    color: C.accent700,
  },
  employeeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: C.divider,
  },
  favRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: C.divider,
    paddingVertical: SPACING.md,
  },
  favHeartBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    margin: -14,
  },
  emptyFavRow: {
    borderTopWidth: 1,
    borderTopColor: C.divider,
    paddingVertical: 27.6,
  },
});
