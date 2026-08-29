import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { getEmployeeAssignment, getCafes, submitEmployeeCrowdLevel } from '../../src/services/data';
import { Cafe, CafeEmployee } from '../../src/types';
import { THEME } from '../../src/constants/theme';
import LoadingScreen from '../../src/components/LoadingScreen';
import Ionicons from '@expo/vector-icons/Ionicons';

export default function EmployeeDashboardScreen() {
  const router = useRouter();
  const colorScheme = (useColorScheme() ?? 'light') as 'light' | 'dark';
  const themeColors = THEME.colors[colorScheme];
  const { signOut, user } = useAuth();

  const [assignment, setAssignment] = useState<CafeEmployee | null>(null);
  const [cafe, setCafe] = useState<Cafe | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedLevel, setSelectedLevel] = useState<number>(5);
  const [updating, setUpdating] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchAssignmentData = async () => {
    setLoading(true);
    setStatusMessage(null);
    try {
      const emp = await getEmployeeAssignment();
      if (!emp) {
        // Not authorized as employee -> redirect to login
        router.replace('/employee/login');
        return;
      }
      setAssignment(emp);

      // Fetch cafe details
      const cafes = await getCafes();
      const currentCafe = cafes.find((c) => c.id === emp.cafe_id);
      setCafe(currentCafe || null);

      if (currentCafe?.current_crowd_level) {
        const parsed = parseInt(String(currentCafe.current_crowd_level), 10);
        if (!isNaN(parsed) && parsed >= 1 && parsed <= 10) {
          setSelectedLevel(parsed);
        } else if (currentCafe.current_crowd_level === 'Low') {
          setSelectedLevel(2);
        } else if (currentCafe.current_crowd_level === 'Moderate') {
          setSelectedLevel(5);
        } else if (currentCafe.current_crowd_level === 'Busy') {
          setSelectedLevel(8);
        } else if (currentCafe.current_crowd_level === 'Full') {
          setSelectedLevel(10);
        }
      }
    } catch (err) {
      console.error('Error loading employee dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAssignmentData();
  }, [user]);

  const handleUpdateCrowdLevel = async () => {
    setStatusMessage(null);
    setUpdating(true);
    try {
      const res = await submitEmployeeCrowdLevel(selectedLevel);
      const successText = `Crowd level updated to ${selectedLevel}/10.`;
      setStatusMessage({ type: 'success', text: successText });

      if (Platform.OS !== 'web') {
        Alert.alert('Update Successful', successText);
      }

      // Refresh cafe data to get latest timestamp
      const cafes = await getCafes();
      const currentCafe = cafes.find((c) => c.id === assignment?.cafe_id);
      if (currentCafe) {
        setCafe(currentCafe);
      }
    } catch (err: any) {
      console.error('Failed to submit crowd level:', err);
      const errorText = err.message || 'Unable to update crowd level. Please try again.';
      setStatusMessage({ type: 'error', text: errorText });

      if (Platform.OS !== 'web') {
        Alert.alert('Update Failed', errorText);
      }
    } finally {
      setUpdating(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    router.replace('/employee/login');
  };

  if (loading) {
    return <LoadingScreen message="Verifying employee authorization..." />;
  }

  if (!assignment) {
    return null;
  }

  const getLevelDescription = (level: number) => {
    if (level <= 2) return 'Very Empty — Plenty of open tables and quiet seating.';
    if (level <= 4) return 'Low / Light — Light traffic, easy to find space.';
    if (level <= 6) return 'Moderate — Comfortable volume, about half full.';
    if (level <= 8) return 'Busy / High — Filling up fast, limited seating remaining.';
    return 'Extremely Crowded / At Capacity — Maximum seating reached.';
  };

  const getLevelColor = (level: number) => {
    if (level <= 3) return themeColors.success;
    if (level <= 6) return themeColors.warning;
    if (level <= 8) return themeColors.accent;
    return themeColors.danger;
  };

  const formatLastUpdated = (dateStr?: string | null) => {
    if (!dateStr) return 'No recent update recorded';
    const diffMs = Date.now() - new Date(dateStr).getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Updated just now';
    if (diffMins < 60) return `Updated ${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    return `Updated ${diffHours}h ago`;
  };

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      {/* Top App Bar */}
      <View style={[styles.topBar, { backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
        <View>
          <Text style={[styles.portalBadge, { color: themeColors.primary }]}>EMPLOYEE PORTAL</Text>
          <Text style={[styles.cafeTitle, { color: themeColors.text }]}>
            {cafe?.name || assignment.cafe_name}
          </Text>
        </View>
        <Pressable onPress={handleSignOut} style={[styles.signOutBtn, { borderColor: themeColors.border }]}>
          <Ionicons name="log-out-outline" size={18} color={themeColors.danger} />
          <Text style={[styles.signOutText, { color: themeColors.danger }]}>Sign Out</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Current Live Status Card */}
        <View style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
          <View style={styles.cardHeaderRow}>
            <Ionicons name="location" size={20} color={themeColors.primary} />
            <Text style={[styles.cardTitle, { color: themeColors.text }]}>Assigned Location</Text>
          </View>
          <Text style={[styles.addressText, { color: themeColors.textMuted }]}>
            {cafe?.address || 'Verified Store Location'}
          </Text>

          <View style={[styles.statusBanner, { backgroundColor: themeColors.surfaceMuted }]}>
            <Text style={[styles.statusLabel, { color: themeColors.textMuted }]}>Current Recorded Crowd Level</Text>
            <View style={styles.statusRow}>
              <Text style={[styles.statusValue, { color: getLevelColor(selectedLevel) }]}>
                {cafe?.current_crowd_level || selectedLevel}/10
              </Text>
              <Text style={[styles.statusTime, { color: themeColors.textLight }]}>
                {formatLastUpdated(cafe?.crowd_updated_at)}
              </Text>
            </View>
          </View>
        </View>

        {/* Update Form Card */}
        <View style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
          <Text style={[styles.questionTitle, { color: themeColors.text }]}>Current crowd level?</Text>
          <Text style={[styles.questionSubtitle, { color: themeColors.textMuted }]}>
            Select a value from 1 (empty) to 10 (fully packed):
          </Text>

          {statusMessage && (
            <View
              style={[
                styles.messageBox,
                {
                  backgroundColor:
                    statusMessage.type === 'success' ? themeColors.successLight : themeColors.dangerLight,
                },
              ]}
            >
              <Ionicons
                name={statusMessage.type === 'success' ? 'checkmark-circle' : 'alert-circle'}
                size={20}
                color={statusMessage.type === 'success' ? themeColors.success : themeColors.danger}
              />
              <Text
                style={[
                  styles.messageText,
                  {
                    color: statusMessage.type === 'success' ? themeColors.success : themeColors.danger,
                  },
                ]}
              >
                {statusMessage.text}
              </Text>
            </View>
          )}

          {/* 1 - 10 Scale Selector */}
          <View style={styles.scaleContainer}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => {
              const isSelected = selectedLevel === num;
              const levelColor = getLevelColor(num);
              return (
                <Pressable
                  key={num}
                  onPress={() => setSelectedLevel(num)}
                  style={[
                    styles.scalePill,
                    { borderColor: isSelected ? levelColor : themeColors.border },
                    isSelected && { backgroundColor: levelColor },
                  ]}
                >
                  <Text
                    style={[
                      styles.scalePillText,
                      { color: isSelected ? '#FFF' : themeColors.text },
                    ]}
                  >
                    {num}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Dynamic Rating Feedback */}
          <View style={[styles.feedbackBox, { backgroundColor: themeColors.surfaceMuted }]}>
            <View style={styles.feedbackHeader}>
              <Text style={[styles.feedbackLevelText, { color: getLevelColor(selectedLevel) }]}>
                Level {selectedLevel} / 10
              </Text>
            </View>
            <Text style={[styles.feedbackDesc, { color: themeColors.text }]}>
              {getLevelDescription(selectedLevel)}
            </Text>
          </View>

          {/* Action Submit Button */}
          <Pressable
            onPress={handleUpdateCrowdLevel}
            disabled={updating}
            style={[
              styles.updateBtn,
              { backgroundColor: themeColors.primary },
              updating && { opacity: 0.7 },
            ]}
          >
            {updating ? (
              <View style={styles.btnRow}>
                <ActivityIndicator color="#FFF" size="small" />
                <Text style={styles.updateBtnText}>Updating...</Text>
              </View>
            ) : (
              <Text style={styles.updateBtnText}>Update Crowd Level</Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topBar: {
    paddingTop: 54,
    paddingBottom: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  portalBadge: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 2,
  },
  cafeTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  signOutText: {
    fontSize: 13,
    fontWeight: '600',
  },
  scrollContent: {
    padding: 20,
    gap: 20,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  addressText: {
    fontSize: 14,
    marginBottom: 16,
  },
  statusBanner: {
    padding: 14,
    borderRadius: 12,
  },
  statusLabel: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 4,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  statusValue: {
    fontSize: 24,
    fontWeight: '800',
  },
  statusTime: {
    fontSize: 13,
    fontWeight: '500',
  },
  questionTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 6,
  },
  questionSubtitle: {
    fontSize: 14,
    marginBottom: 16,
  },
  messageBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
  },
  messageText: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  scaleContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
    justifyContent: 'space-between',
  },
  scalePill: {
    width: '18%',
    height: 48,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scalePillText: {
    fontSize: 18,
    fontWeight: '700',
  },
  feedbackBox: {
    padding: 14,
    borderRadius: 12,
    marginBottom: 20,
  },
  feedbackHeader: {
    marginBottom: 4,
  },
  feedbackLevelText: {
    fontSize: 15,
    fontWeight: '700',
  },
  feedbackDesc: {
    fontSize: 14,
    lineHeight: 20,
  },
  updateBtn: {
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  updateBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
