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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const toggleMode = () => {
    if (loading) return;
    setIsLogin(!isLogin);
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  const handleGoogleAuth = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
    } catch (err: any) {
      console.error('Google Auth Error:', { message: err?.message, status: err?.status });
      const msg = err?.message || 'Could not authenticate with Google.';
      setErrorMessage(msg);
      Alert.alert('Google Sign In Failed', msg);
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleAuth = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);

    const cleanEmail = email.trim();

    if (!cleanEmail || !password) {
      setErrorMessage('Please enter both your email address and password.');
      return;
    }

    if (!isLogin && !displayName.trim()) {
      setErrorMessage('Please provide a display name.');
      return;
    }

    setLoading(true);
    try {
      if (isLogin) {
        // Sign In using Supabase signInWithPassword
        const { data, error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password: password,
        });

        if (error) {
          console.error('Supabase signInWithPassword error:', {
            message: error.message,
            status: error.status,
            name: error.name,
          });

          let formattedMsg = error.message;
          const lowerMsg = error.message.toLowerCase();

          if (lowerMsg.includes('invalid login credentials')) {
            formattedMsg = 'Invalid email or password. Note: If you registered with Google OAuth, please use "Continue with Google".';
          } else if (lowerMsg.includes('email not confirmed')) {
            formattedMsg = 'Email address not confirmed. Please check your inbox to verify your email before signing in.';
          } else if (lowerMsg.includes('user not found') || lowerMsg.includes('no user')) {
            formattedMsg = 'No account found with this email address.';
          }

          setErrorMessage(formattedMsg);
          Alert.alert('Sign In Failed', formattedMsg);
          return;
        }
      } else {
        // Sign Up using Supabase signUp
        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password: password,
          options: {
            data: {
              display_name: displayName.trim(),
            },
          },
        });

        if (error) {
          console.error('Supabase signUp error:', {
            message: error.message,
            status: error.status,
            name: error.name,
          });

          setErrorMessage(error.message);
          Alert.alert('Sign Up Failed', error.message);
          return;
        }

        if (data?.user && (!data?.session)) {
          setSuccessMessage('Account created! Please check your email inbox to confirm your account.');
          Alert.alert(
            'Confirmation Required',
            'Your account has been created. Please check your email to verify your address before logging in.'
          );
        } else {
          setSuccessMessage('Your FindMyCafe account has been successfully created!');
        }
      }
    } catch (err: any) {
      console.error('Unexpected Auth Error:', { message: err?.message });
      const unexpectedMsg = err?.message || 'An unexpected error occurred.';
      setErrorMessage(unexpectedMsg);
      Alert.alert('Authentication Failed', unexpectedMsg);
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
              {isLogin ? 'Sign in to rate café study vibes' : 'Join fellow UCI students on FindMyCafe'}
            </Text>
          </View>

          {/* Inline Banners for Error or Success */}
          {errorMessage && (
            <View style={[styles.banner, styles.errorBanner]}>
              <Ionicons name="alert-circle" size={18} color="#D32F2F" style={styles.bannerIcon} />
              <Text style={styles.errorBannerText}>{errorMessage}</Text>
            </View>
          )}

          {successMessage && (
            <View style={[styles.banner, styles.successBanner]}>
              <Ionicons name="checkmark-circle" size={18} color="#2E7D32" style={styles.bannerIcon} />
              <Text style={styles.successBannerText}>{successMessage}</Text>
            </View>
          )}

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
                    onChangeText={(val) => {
                      setDisplayName(val);
                      if (errorMessage) setErrorMessage(null);
                    }}
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
                  onChangeText={(val) => {
                    setEmail(val);
                    if (errorMessage) setErrorMessage(null);
                  }}
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
                  onChangeText={(val) => {
                    setPassword(val);
                    if (errorMessage) setErrorMessage(null);
                  }}
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
            <Pressable onPress={toggleMode} style={styles.toggleBtn}>
              <Text style={[styles.toggleBtnText, { color: themeColors.primaryLight }]}>
                {isLogin ? 'Create one' : 'Sign in'}
              </Text>
            </Pressable>
          </View>

          {/* Employee Login Entry Point */}
          <View style={{ marginTop: 20, paddingTop: 16, borderTopWidth: 1, borderTopColor: themeColors.border, alignItems: 'center' }}>
            <Pressable
              onPress={() => router.push('/employee/login')}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 }}
            >
              <Ionicons name="briefcase-outline" size={16} color={themeColors.primary} />
              <Text style={{ fontSize: 13, fontWeight: '600', color: themeColors.primary }}>
                Café Employee Login
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
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: THEME.spacing.sm + 2,
    borderRadius: THEME.roundness.md,
    marginBottom: THEME.spacing.md,
  },
  errorBanner: {
    backgroundColor: '#FFEBEE',
    borderWidth: 1,
    borderColor: '#FFCDD2',
  },
  errorBannerText: {
    color: '#C62828',
    fontSize: THEME.typography.sizes.xs,
    flex: 1,
    fontWeight: '500',
  },
  successBanner: {
    backgroundColor: '#E8F5E9',
    borderWidth: 1,
    borderColor: '#C8E6C9',
  },
  successBannerText: {
    color: '#2E7D32',
    fontSize: THEME.typography.sizes.xs,
    flex: 1,
    fontWeight: '500',
  },
  bannerIcon: {
    marginRight: THEME.spacing.xs + 2,
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
