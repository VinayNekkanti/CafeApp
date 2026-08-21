import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from 'react-native';
import { useAuth } from '../src/context/AuthContext';
import { supabase } from '../src/services/supabase';
import { THEME } from '../src/constants/theme';
import Ionicons from '@expo/vector-icons/Ionicons';

export default function OnboardingScreen() {
  const colorScheme = (useColorScheme() ?? 'light') as 'light' | 'dark';
  const themeColors = THEME.colors[colorScheme];

  const { user, profile, refreshProfile } = useAuth();

  const [firstName, setFirstName] = useState(profile?.first_name || '');
  const [lastName, setLastName] = useState(profile?.last_name || '');
  const [phoneNumber, setPhoneNumber] = useState(profile?.phone_number || '');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async () => {
    console.log('[Onboarding] Save & Continue clicked.');
    console.log('[Onboarding] User session active:', Boolean(user), 'User ID:', user?.id || 'None');
    console.log('[Onboarding] Input values:', { firstName, lastName, phoneNumber });

    setErrorMsg(null);

    if (!firstName.trim() || !lastName.trim() || !phoneNumber.trim()) {
      const msg = 'Please fill in all required fields (First Name, Last Name, and Phone Number).';
      console.warn('[Onboarding] Validation failed:', msg);
      setErrorMsg(msg);
      return;
    }

    if (!user) {
      const msg = 'No authenticated user session found. Please sign in again.';
      console.error('[Onboarding] Auth check failed:', msg);
      setErrorMsg(msg);
      return;
    }

    setSaving(true);

    try {
      const payload = {
        id: user.id,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        phone_number: phoneNumber.trim(),
        updated_at: new Date().toISOString(),
      };

      console.log('[Onboarding] Executing Supabase upsert with payload:', payload);

      const { data, error } = await supabase
        .from('profiles')
        .upsert(payload, { onConflict: 'id' })
        .select();

      if (error) {
        console.error('[Onboarding] Supabase upsert returned error:', {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
        });
        setErrorMsg(`Database Error (${error.code || 'UPSERT_FAILED'}): ${error.message}`);
        Alert.alert('Save Failed', error.message);
        return;
      }

      console.log('[Onboarding] Profile upsert succeeded. Returned data:', data);

      console.log('[Onboarding] Refreshing AuthContext profile state...');
      await refreshProfile();
      console.log('[Onboarding] Profile state refreshed successfully.');
    } catch (err: any) {
      console.error('[Onboarding] Unexpected catch exception:', err);
      const msg = err.message || 'An unexpected error occurred while saving your profile.';
      setErrorMsg(msg);
      Alert.alert('Save Error', msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, { backgroundColor: themeColors.background }]}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={[styles.iconCircle, { backgroundColor: themeColors.surfaceMuted }]}>
              <Ionicons name="person" size={36} color={themeColors.primary} />
            </View>
            <Text style={[styles.title, { color: themeColors.text }]}>Complete Your Profile</Text>
            <Text style={[styles.subtitle, { color: themeColors.textLight }]}>
              Please provide your details to finish setting up your account before exploring study spots.
            </Text>
          </View>

          {/* In-UI Error Banner */}
          {errorMsg && (
            <View style={[styles.errorBanner, { backgroundColor: themeColors.dangerLight || '#FEE2E2' }]}>
              <Ionicons name="alert-circle" size={18} color={themeColors.danger || '#EF4444'} />
              <Text style={[styles.errorBannerText, { color: themeColors.danger || '#EF4444' }]}>{errorMsg}</Text>
            </View>
          )}

          {/* Form */}
          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: themeColors.textMuted }]}>First Name *</Text>
              <View style={[styles.inputWrapper, { backgroundColor: themeColors.surfaceMuted, borderColor: themeColors.border }]}>
                <Ionicons name="person-outline" size={16} color={themeColors.textLight} style={styles.inputIcon} />
                <TextInput
                  placeholder="Peter"
                  placeholderTextColor={themeColors.textLight}
                  style={[styles.input, { color: themeColors.text }]}
                  value={firstName}
                  onChangeText={setFirstName}
                  autoCapitalize="words"
                  editable={!saving}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: themeColors.textMuted }]}>Last Name *</Text>
              <View style={[styles.inputWrapper, { backgroundColor: themeColors.surfaceMuted, borderColor: themeColors.border }]}>
                <Ionicons name="person-outline" size={16} color={themeColors.textLight} style={styles.inputIcon} />
                <TextInput
                  placeholder="Anteater"
                  placeholderTextColor={themeColors.textLight}
                  style={[styles.input, { color: themeColors.text }]}
                  value={lastName}
                  onChangeText={setLastName}
                  autoCapitalize="words"
                  editable={!saving}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: themeColors.textMuted }]}>Phone Number *</Text>
              <View style={[styles.inputWrapper, { backgroundColor: themeColors.surfaceMuted, borderColor: themeColors.border }]}>
                <Ionicons name="call-outline" size={16} color={themeColors.textLight} style={styles.inputIcon} />
                <TextInput
                  placeholder="(949) 555-0199"
                  placeholderTextColor={themeColors.textLight}
                  style={[styles.input, { color: themeColors.text }]}
                  value={phoneNumber}
                  onChangeText={setPhoneNumber}
                  keyboardType="phone-pad"
                  editable={!saving}
                />
              </View>
            </View>

            {/* Submit Button */}
            <Pressable
              onPress={handleSubmit}
              disabled={saving}
              style={({ pressed }) => [
                styles.submitBtn,
                { backgroundColor: themeColors.primary },
                saving && { opacity: 0.7 },
                pressed && { opacity: 0.9 },
              ]}
            >
              {saving ? (
                <View style={styles.savingRow}>
                  <ActivityIndicator color="#FFF" size="small" />
                  <Text style={styles.submitBtnText}>Saving Profile...</Text>
                </View>
              ) : (
                <Text style={styles.submitBtnText}>Save & Continue</Text>
              )}
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: THEME.spacing.lg,
  },
  card: {
    borderWidth: 1,
    borderRadius: THEME.roundness.md,
    padding: THEME.spacing.lg,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  header: {
    alignItems: 'center',
    marginBottom: THEME.spacing.xl,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: THEME.spacing.md,
  },
  title: {
    fontSize: THEME.typography.sizes.lg,
    fontWeight: 'bold',
    marginBottom: THEME.spacing.xs,
  },
  subtitle: {
    fontSize: THEME.typography.sizes.xs,
    textAlign: 'center',
    paddingHorizontal: THEME.spacing.sm,
    lineHeight: 18,
  },
  form: {
    gap: THEME.spacing.md,
  },
  inputGroup: {
    gap: 4,
  },
  label: {
    fontSize: 11,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: THEME.roundness.md,
    paddingHorizontal: THEME.spacing.md,
    height: 46,
  },
  inputIcon: {
    marginRight: THEME.spacing.sm,
  },
  input: {
    flex: 1,
    fontSize: THEME.typography.sizes.sm,
    fontWeight: '500',
  },
  submitBtn: {
    height: 48,
    borderRadius: THEME.roundness.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: THEME.spacing.sm,
  },
  submitBtnText: {
    color: '#FFF',
    fontSize: THEME.typography.sizes.sm,
    fontWeight: 'bold',
  },
  savingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: THEME.spacing.sm,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: THEME.spacing.md,
    borderRadius: THEME.roundness.md,
    marginBottom: THEME.spacing.md,
    gap: THEME.spacing.sm,
  },
  errorBannerText: {
    flex: 1,
    fontSize: THEME.typography.sizes.xs,
    fontWeight: '600',
  },
});
