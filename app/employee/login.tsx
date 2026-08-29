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
import { useRouter } from 'expo-router';
import { supabase } from '../../src/services/supabase';
import { getEmployeeAssignment } from '../../src/services/data';
import { THEME } from '../../src/constants/theme';
import Ionicons from '@expo/vector-icons/Ionicons';

export default function EmployeeLoginScreen() {
  const router = useRouter();
  const colorScheme = (useColorScheme() ?? 'light') as 'light' | 'dark';
  const themeColors = THEME.colors[colorScheme];

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleEmployeeLogin = async () => {
    setErrorMessage(null);
    const cleanEmail = email.trim();

    if (!cleanEmail || !password) {
      setErrorMessage('Please enter both your email address and password.');
      return;
    }

    setLoading(true);
    try {
      // Step 1: Supabase Auth signInWithPassword
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: password,
      });

      if (authError) {
        console.error('Employee Auth Error:', authError.message);
        let formattedMsg = 'Invalid email or password.';
        if (authError.message.toLowerCase().includes('invalid login credentials')) {
          formattedMsg = 'Invalid employee email or password.';
        } else if (authError.message.toLowerCase().includes('email not confirmed')) {
          formattedMsg = 'Employee email address not confirmed.';
        }
        setErrorMessage(formattedMsg);
        if (Platform.OS !== 'web') {
          Alert.alert('Login Failed', formattedMsg);
        }
        setLoading(false);
        return;
      }

      // Step 2: Verify employee mapping in cafe_employees table
      const assignment = await getEmployeeAssignment();

      if (!assignment) {
        // Do NOT call signOut; preserve session state for standard student accounts
        const unauthorizedMsg = 'This account is not authorized as a café employee.';
        setErrorMessage(unauthorizedMsg);
        if (Platform.OS !== 'web') {
          Alert.alert('Access Denied', unauthorizedMsg);
        }
        setLoading(false);
        return;
      }

      // Step 3: Route to employee dashboard
      router.replace('/employee/dashboard');
    } catch (err: any) {
      console.error('Unexpected Employee Login Error:', err);
      const msg = err.message || 'An unexpected error occurred during login.';
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: themeColors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Top Header & Back Link */}
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.push('/(tabs)')} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={themeColors.text} />
            <Text style={[styles.backText, { color: themeColors.text }]}>Back to App</Text>
          </Pressable>
        </View>

        {/* Title Section */}
        <View style={styles.titleSection}>
          <View style={[styles.badgeIcon, { backgroundColor: themeColors.primaryLight }]}>
            <Ionicons name="briefcase" size={32} color={themeColors.primary} />
          </View>
          <Text style={[styles.title, { color: themeColors.text }]}>Employee Portal</Text>
          <Text style={[styles.subtitle, { color: themeColors.textMuted }]}>
            Sign in with your café employee credentials to manage live crowd levels.
          </Text>
        </View>

        {/* Form Fields */}
        <View style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
          {errorMessage && (
            <View style={[styles.errorContainer, { backgroundColor: themeColors.dangerLight }]}>
              <Ionicons name="alert-circle" size={20} color={themeColors.danger} />
              <Text style={[styles.errorText, { color: themeColors.danger }]}>{errorMessage}</Text>
            </View>
          )}

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: themeColors.text }]}>Employee Email</Text>
            <View style={[styles.inputWrapper, { backgroundColor: themeColors.surfaceMuted, borderColor: themeColors.border }]}>
              <Ionicons name="mail-outline" size={20} color={themeColors.textMuted} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { color: themeColors.text }]}
                placeholder="employee@cafe.com"
                placeholderTextColor={themeColors.textLight}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: themeColors.text }]}>Password</Text>
            <View style={[styles.inputWrapper, { backgroundColor: themeColors.surfaceMuted, borderColor: themeColors.border }]}>
              <Ionicons name="lock-closed-outline" size={20} color={themeColors.textMuted} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { color: themeColors.text }]}
                placeholder="••••••••"
                placeholderTextColor={themeColors.textLight}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
              />
            </View>
          </View>

          {/* Submit Button */}
          <Pressable
            onPress={handleEmployeeLogin}
            disabled={loading}
            style={[
              styles.submitBtn,
              { backgroundColor: themeColors.primary },
              loading && { opacity: 0.7 },
            ]}
          >
            {loading ? (
              <ActivityIndicator color="#FFF" size="small" />
            ) : (
              <Text style={styles.submitBtnText}>Sign In to Employee Portal</Text>
            )}
          </Pressable>
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
    padding: 24,
    paddingTop: 60,
  },
  headerRow: {
    marginBottom: 20,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  backText: {
    fontSize: 16,
    fontWeight: '500',
  },
  titleSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  badgeIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 20,
    lineHeight: 20,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    gap: 8,
    marginBottom: 16,
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 50,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 16,
    height: '100%',
  },
  submitBtn: {
    height: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  submitBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
