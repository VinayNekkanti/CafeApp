import React, { useCallback, useState } from 'react';
import {
  FlatList,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { useLocation } from '../../src/context/LocationContext';
import { getCafes, getCafeHoursBatch, getFavorites, toggleFavorite } from '../../src/services/data';
import { Cafe, CafeHours } from '../../src/types';
import { THEME } from '../../src/constants/theme';
import CafeCard from '../../src/components/CafeCard';
import LoadingScreen from '../../src/components/LoadingScreen';
import Ionicons from '@expo/vector-icons/Ionicons';

export default function ProfileScreen() {
  const router = useRouter();
  const colorScheme = (useColorScheme() ?? 'light') as 'light' | 'dark';
  const themeColors = THEME.colors[colorScheme];

  const { user, profile, loading: authLoading, signOut } = useAuth();
  const { location } = useLocation();

  // State
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

  // Re-fetch favorites and employee status when screen gains focus
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

  // 1. Unauthenticated View
  if (!user) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
        <View style={styles.authPromptWrapper}>
          <View style={[styles.authCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
            <View style={[styles.iconCircle, { backgroundColor: themeColors.surfaceMuted }]}>
              <Ionicons name="heart-outline" size={32} color={themeColors.primary} />
            </View>
            <Text style={[styles.authTitle, { color: themeColors.text }]}>Save Your Favorites</Text>
            <Text style={[styles.authSubtitle, { color: themeColors.textMuted }]}>
              Create a free student profile to save your favorite Irvine FindMyCafe locations, rate environment noise, and help your peers.
            </Text>
            <Pressable
              onPress={() => router.push('/auth')}
              style={({ pressed }) => [
                styles.primaryBtn,
                { backgroundColor: themeColors.primary },
                pressed && { opacity: 0.9 },
              ]}
            >
              <Text style={styles.primaryBtnText}>Sign In / Create Account</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // 2. Authenticated View
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
      {/* User Info Header Banner */}
      <View style={[styles.profileHeader, { backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
        <View style={styles.avatarRow}>
          <View style={[styles.avatarCircle, { backgroundColor: themeColors.primary }]}>
            <Text style={styles.avatarLetter}>
              {profile?.first_name?.trim()
                ? profile.first_name.trim().charAt(0).toUpperCase()
                : profile?.display_name?.trim()
                ? profile.display_name.trim().charAt(0).toUpperCase()
                : user.email
                ? user.email.charAt(0).toUpperCase()
                : 'U'}
            </Text>
          </View>
          <View style={styles.avatarContent}>
            <Text style={[styles.profileName, { color: themeColors.text }]}>
              {profile?.display_name?.trim() ||
                [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim() ||
                (user.email ? user.email.split('@')[0] : 'User')}
            </Text>
            <Text style={[styles.profileEmail, { color: themeColors.textMuted }]}>
              {user.email}
            </Text>
          </View>
        </View>

        <Pressable
          onPress={handleLogout}
          style={({ pressed }) => [
            styles.logoutBtn,
            { borderColor: themeColors.border },
            pressed && { backgroundColor: themeColors.surfaceMuted },
          ]}
        >
          <Ionicons name="log-out-outline" size={16} color={themeColors.textMuted} />
          <Text style={[styles.logoutText, { color: themeColors.textMuted }]}>Log Out</Text>
        </Pressable>
      </View>

      {/* Employee Quick Access Banner */}
      {employeeAssignment && (
        <Pressable
          onPress={() => router.push('/employee/dashboard')}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: themeColors.primaryLight,
            paddingHorizontal: 16,
            paddingVertical: 12,
            marginHorizontal: 16,
            marginTop: 12,
            borderRadius: 12,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Ionicons name="briefcase" size={20} color={themeColors.primary} />
            <View>
              <Text style={{ fontSize: 14, fontWeight: '700', color: themeColors.primary }}>
                Employee Portal
              </Text>
              <Text style={{ fontSize: 12, color: themeColors.textMuted }}>
                Update live crowd for {employeeAssignment.cafe_name}
              </Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color={themeColors.primary} />
        </Pressable>
      )}

      {/* Favorites Title */}
      <View style={styles.sectionHeader}>
        <Ionicons name="heart" size={18} color="#EF4444" />
        <Text style={[styles.sectionTitle, { color: themeColors.text }]}>Saved FindMyCafe Locations</Text>
      </View>

      {/* Favorites List */}
      {loadingFavorites ? (
        <LoadingScreen message="Fetching saved spots..." />
      ) : (
        <FlatList
          data={favoriteCafes}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <CafeCard
              cafe={item}
              hours={hours[item.id] || []}
              userLat={location.latitude}
              userLon={location.longitude}
              isFavorite={true}
              onToggleFavorite={() => handleRemoveFavorite(item.id)}
              onPress={() => router.push(`/cafe/${item.id}`)}
            />
          )}
          ListEmptyComponent={
            <View style={styles.emptyFavorites}>
              <Ionicons name="bookmark-outline" size={40} color={themeColors.textLight} />
              <Text style={[styles.emptyFavTitle, { color: themeColors.text }]}>No Saved Spots Yet</Text>
              <Text style={[styles.emptyFavSub, { color: themeColors.textMuted }]}>
                Tap the heart on any café profile to save it here for quick access.
              </Text>
              <Pressable
                onPress={() => router.push('/(tabs)')}
                style={[styles.exploreBtn, { backgroundColor: themeColors.primary }]}
              >
                <Text style={styles.exploreBtnText}>Explore FindMyCafe</Text>
              </Pressable>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  authPromptWrapper: {
    flex: 1,
    justifyContent: 'center',
    padding: THEME.spacing.lg,
  },
  authCard: {
    borderWidth: 1,
    borderRadius: THEME.roundness.md,
    padding: THEME.spacing.xl,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: THEME.spacing.md,
  },
  authTitle: {
    fontSize: THEME.typography.sizes.md,
    fontWeight: 'bold',
    marginBottom: THEME.spacing.xs,
  },
  authSubtitle: {
    fontSize: THEME.typography.sizes.xs,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: THEME.spacing.xl,
  },
  primaryBtn: {
    width: '100%',
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
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: THEME.spacing.lg,
    borderBottomWidth: 1,
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: THEME.spacing.md,
  },
  avatarCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    color: '#FFF',
    fontSize: THEME.typography.sizes.lg,
    fontWeight: 'bold',
  },
  avatarContent: {
    gap: 2,
  },
  profileName: {
    fontSize: THEME.typography.sizes.md,
    fontWeight: 'bold',
  },
  profileEmail: {
    fontSize: THEME.typography.sizes.xs,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: THEME.roundness.sm,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  logoutText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: THEME.spacing.lg,
    paddingTop: THEME.spacing.lg,
    gap: 6,
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: THEME.typography.sizes.sm,
    fontWeight: 'bold',
  },
  listContent: {
    paddingVertical: THEME.spacing.xs,
  },
  emptyFavorites: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    paddingHorizontal: THEME.spacing.xl,
  },
  emptyFavTitle: {
    fontSize: THEME.typography.sizes.sm,
    fontWeight: 'bold',
    marginTop: THEME.spacing.md,
    marginBottom: THEME.spacing.xs,
  },
  emptyFavSub: {
    fontSize: THEME.typography.sizes.xs,
    textAlign: 'center',
    marginBottom: THEME.spacing.lg,
  },
  exploreBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: THEME.roundness.md,
  },
  exploreBtnText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
});
