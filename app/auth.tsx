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
import { useAuth } from '../src/context/AuthContext';
import { supabase } from '../src/services/supabase';
import { THEME } from '../src/constants/theme';
import Ionicons from '@expo/vector-icons/Ionicons';

export default function AuthScreen() {
  const router = useRouter();
  const colorScheme = (useColorScheme() ?? 'light') as 'light' | 'dark';
  const themeColors = THEME.colors[colorScheme];
  const { signInWithGoogle } = useAuth();

  // State
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleGoogleAuth = async () => {
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
    } catch (err: any) {
      Alert.alert('Google Sign In Failed', err.message || 'Could not authenticate with Google.');
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleAuth = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Validation Error', 'Please fill in all required fields.');
      return;
    }

    if (!isLogin && !displayName.trim()) {
      Alert.alert('Validation Error', 'Please provide a display name.');
      return;
    }

    setLoading(true);
    try {
      if (isLogin) {
        // Sign In
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: password.trim(),
        });
        if (error) throw error;
      } else {
        // Sign Up
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password: password.trim(),
          options: {
            data: {
              display_name: displayName.trim(),
            },
          },
        });
        if (error) throw error;
        
        Alert.alert(
          'Account Created',
          'Your student study spot account has been successfully created!'
        );
      }
    } catch (err: any) {
      Alert.alert('Authentication Failed', err.message || 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, { backgroundColor: themeColors.background }]}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
          {/* Logo Vibe */}
          <View style={styles.logoContainer}>
            <View style={[styles.logoCircle, { backgroundColor: themeColors.surfaceMuted }]}>
              <Ionicons name="cafe" size={36} color={themeColors.primary} />
            </View>
            <Text style={[styles.title, { color: themeColors.text }]}>
              {isLogin ? 'Welcome Back' : 'Create Account'}
            </Text>
            <Text style={[styles.subtitle, { color: themeColors.textLight }]}>
              {isLogin ? 'Sign in to rate café study vibes' : 'Join fellow UCI students to find study spots'}
            </Text>
          </View>

          {/* Google OAuth Button */}
          <Pressable
            onPress={handleGoogleAuth}
            disabled={googleLoading || loading}
            style={({ pressed }) => [
              styles.googleBtn,
              { backgroundColor: themeColors.surfaceMuted, borderColor: themeColors.border },
              (googleLoading || loading) && { opacity: 0.7 },
              pressed && { opacity: 0.9 },
            ]}
          >
            {googleLoading ? (
              <ActivityIndicator size="small" color={themeColors.primary} />
            ) : (
              <>
                <Ionicons name="logo-google" size={20} color="#EA4335" style={{ marginRight: 10 }} />
                <Text style={[styles.googleBtnText, { color: themeColors.text }]}>Continue with Google</Text>
              </>
            )}
          </Pressable>

          {/* Divider */}
          <View style={styles.dividerRow}>
            <View style={[styles.dividerLine, { backgroundColor: themeColors.border }]} />
            <Text style={[styles.dividerText, { color: themeColors.textMuted }]}>OR</Text>
            <View style={[styles.dividerLine, { backgroundColor: themeColors.border }]} />
          </View>

          {/* Form */}
          <View style={styles.form}>
            {!isLogin && (
              <View style={styles.inputGroup}>
                <Text style={[styles.label, { color: themeColors.textMuted }]}>Display Name</Text>
                <View style={[styles.inputWrapper, { backgroundColor: themeColors.surfaceMuted, borderColor: themeColors.border }]}>
                  <Ionicons name="person-outline" size={16} color={themeColors.textLight} style={styles.inputIcon} />
                  <TextInput
                    placeholder="Anteater Study"
                    placeholderTextColor={themeColors.textLight}
                    style={[styles.input, { color: themeColors.text }]}
                    value={displayName}
                    onChangeText={setDisplayName}
                    autoCapitalize="words"
                    editable={!loading}
                  />
                </View>
              </View>
            )}

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: themeColors.textMuted }]}>Email Address</Text>
              <View style={[styles.inputWrapper, { backgroundColor: themeColors.surfaceMuted, borderColor: themeColors.border }]}>
                <Ionicons name="mail-outline" size={16} color={themeColors.textLight} style={styles.inputIcon} />
                <TextInput
                  placeholder="yourname@uci.edu"
                  placeholderTextColor={themeColors.textLight}
                  style={[styles.input, { color: themeColors.text }]}
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  editable={!loading}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: themeColors.textMuted }]}>Password</Text>
              <View style={[styles.inputWrapper, { backgroundColor: themeColors.surfaceMuted, borderColor: themeColors.border }]}>
                <Ionicons name="lock-closed-outline" size={16} color={themeColors.textLight} style={styles.inputIcon} />
                <TextInput
                  placeholder="••••••••"
                  placeholderTextColor={themeColors.textLight}
                  style={[styles.input, { color: themeColors.text }]}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoCapitalize="none"
                  editable={!loading}
                />
              </View>
            </View>

            {/* Action Button */}
            <Pressable
              onPress={handleAuth}
              disabled={loading}
              style={({ pressed }) => [
                styles.actionBtn,
                { backgroundColor: themeColors.primary },
                loading && { opacity: 0.7 },
                pressed && { opacity: 0.9 },
              ]}
            >
              {loading ? (
                <ActivityIndicator color="#FFF" size="small" />
              ) : (
                <Text style={styles.actionBtnText}>
                  {isLogin ? 'Sign In' : 'Create Account'}
                </Text>
              )}
            </Pressable>
          </View>

          {/* Toggle Mode */}
          <View style={styles.footer}>
            <Text style={[styles.footerText, { color: themeColors.textMuted }]}>
              {isLogin ? "Don't have an account?" : 'Already have an account?'}
            </Text>
            <Pressable onPress={() => !loading && setIsLogin(!isLogin)} style={styles.toggleBtn}>
              <Text style={[styles.toggleBtnText, { color: themeColors.primaryLight }]}>
                {isLogin ? 'Create one' : 'Sign in'}
              </Text>
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
  logoContainer: {
    alignItems: 'center',
    marginBottom: THEME.spacing.md,
  },
  googleBtn: {
    height: 48,
    borderRadius: THEME.roundness.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    paddingHorizontal: THEME.spacing.md,
    marginBottom: THEME.spacing.md,
  },
  googleBtnText: {
    fontSize: THEME.typography.sizes.sm,
    fontWeight: 'bold',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: THEME.spacing.md,
    gap: THEME.spacing.sm,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  logoCircle: {
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
    paddingHorizontal: THEME.spacing.md,
  },
  form: {
    gap: THEME.spacing.md,
    marginBottom: THEME.spacing.lg,
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
  actionBtn: {
    height: 48,
    borderRadius: THEME.roundness.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: THEME.spacing.sm,
  },
  actionBtnText: {
    color: '#FFF',
    fontSize: THEME.typography.sizes.sm,
    fontWeight: 'bold',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  footerText: {
    fontSize: THEME.typography.sizes.xs,
  },
  toggleBtn: {
    paddingVertical: 4,
  },
  toggleBtnText: {
    fontSize: THEME.typography.sizes.xs,
    fontWeight: 'bold',
    textDecorationLine: 'underline',
  },
});
