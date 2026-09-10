import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { User } from 'lucide-react-native';
import { useAuth } from '../src/context/AuthContext';
import { supabase } from '../src/services/supabase';
import { THEME } from '../src/constants/theme';
import { Kicker, OutlineButton } from '../src/components/classical';

const { colors: C, spacing: SPACING, type: TYPE } = THEME;

export default function OnboardingScreen() {
  const { user, profile, refreshProfile } = useAuth();

  const [firstName, setFirstName] = useState(profile?.first_name || '');
  const [lastName, setLastName] = useState(profile?.last_name || '');
  const [phoneNumber, setPhoneNumber] = useState(profile?.phone_number || '');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async () => {
    setErrorMsg(null);

    if (!firstName.trim() || !lastName.trim() || !phoneNumber.trim()) {
      setErrorMsg('Please fill in all required fields (First Name, Last Name, and Phone Number).');
      return;
    }

    if (!user) {
      setErrorMsg('No authenticated user session found. Please sign in again.');
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

      const { error } = await supabase.from('profiles').upsert(payload, { onConflict: 'id' }).select();

      if (error) {
        console.error('[Onboarding] Supabase upsert returned error:', {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
        });
        setErrorMsg(`Database Error (${error.code || 'UPSERT_FAILED'}): ${error.message}`);
        return;
      }

      await refreshProfile();
    } catch (err: any) {
      console.error('[Onboarding] Unexpected catch exception:', err);
      setErrorMsg(err.message || 'An unexpected error occurred while saving your profile.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <View style={styles.iconCircle}>
            <User size={30} color={C.accent700} strokeWidth={1.6} />
          </View>
          <Text style={[TYPE.screenTitle, { color: C.text, marginTop: SPACING.md }]}>Complete Your Profile</Text>
          <Text style={[TYPE.bodyTight, styles.subtitle]}>
            Please provide your details to finish setting up your account before exploring FindMyCafe.
          </Text>
        </View>

        {errorMsg && <Text style={[TYPE.metaSmall, styles.errorText]}>{errorMsg}</Text>}

        <View style={styles.form}>
          <View style={styles.inputGroup}>
            <Kicker>First Name</Kicker>
            <TextInput
              placeholder="Peter"
              placeholderTextColor={C.textLight}
              style={styles.input}
              value={firstName}
              onChangeText={setFirstName}
              autoCapitalize="words"
              editable={!saving}
            />
          </View>

          <View style={styles.inputGroup}>
            <Kicker>Last Name</Kicker>
            <TextInput
              placeholder="Anteater"
              placeholderTextColor={C.textLight}
              style={styles.input}
              value={lastName}
              onChangeText={setLastName}
              autoCapitalize="words"
              editable={!saving}
            />
          </View>

          <View style={styles.inputGroup}>
            <Kicker>Phone Number</Kicker>
            <TextInput
              placeholder="(949) 555-0199"
              placeholderTextColor={C.textLight}
              style={styles.input}
              value={phoneNumber}
              onChangeText={setPhoneNumber}
              keyboardType="phone-pad"
              editable={!saving}
            />
          </View>

          <OutlineButton
            label={saving ? 'Saving…' : 'Save & Continue'}
            onPress={handleSubmit}
            disabled={saving}
            style={{ marginTop: SPACING.sm }}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: SPACING.screen,
  },
  header: {
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subtitle: {
    color: C.textSecondary,
    textAlign: 'center',
    marginTop: 6,
  },
  errorText: {
    color: C.danger,
    textAlign: 'center',
    marginBottom: SPACING.md,
  },
  form: {
    gap: SPACING.md,
  },
  inputGroup: {
    gap: 6,
  },
  input: {
    fontFamily: THEME.fonts.body,
    fontSize: 15,
    color: C.text,
    borderBottomWidth: 1,
    borderBottomColor: C.hairlineStrong,
    paddingVertical: 8,
  },
});
