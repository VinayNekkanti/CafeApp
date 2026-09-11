import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Mail, Lock, User as UserIcon, Briefcase } from 'lucide-react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAuth } from '../src/context/AuthContext';
import { supabase } from '../src/services/supabase';
import { THEME } from '../src/constants/theme';
import { Divider, Kicker, OutlineButton, Plate } from '../src/components/classical';

const { colors: C, spacing: SPACING, type: TYPE } = THEME;

export default function AuthScreen() {
  const router = useRouter();
  const { signInWithGoogle } = useAuth();

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
        const { error } = await supabase.auth.signInWithPassword({
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

        if (data?.user && !data?.session) {
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
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.logoWrap}>
          <Plate size={64}>
            <Image source={require('../assets/images/logo.png')} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
          </Plate>
          <Text style={[TYPE.screenTitle, { color: C.text, marginTop: SPACING.md }]}>
            {isLogin ? 'Welcome back' : 'Create account'}
          </Text>
          <Text style={[TYPE.bodyTight, styles.subtitle]}>
            {isLogin ? 'Sign in to rate café study vibes' : 'Join fellow UCI students on FindMyCafe'}
          </Text>
        </View>

        {errorMessage && <Text style={[TYPE.metaSmall, styles.messageText, { color: C.danger }]}>{errorMessage}</Text>}
        {successMessage && <Text style={[TYPE.metaSmall, styles.messageText, { color: C.accent700 }]}>{successMessage}</Text>}

        {/* Google auth needs a leading brand icon, which OutlineButton's plain
            label API doesn't support — styled to match it exactly instead. */}
        <Pressable
          onPress={handleGoogleAuth}
          disabled={googleLoading || loading}
          style={({ pressed }) => [
            styles.googleBtn,
            (googleLoading || loading) && { opacity: 0.5 },
            pressed && !(googleLoading || loading) && { backgroundColor: C.surface },
          ]}
        >
          {googleLoading ? (
            <ActivityIndicator size="small" color={C.accent700} />
          ) : (
            <>
              <Ionicons name="logo-google" size={17} color="#EA4335" />
              <Text style={[TYPE.kicker, { fontSize: 13, color: C.text }]}>Continue with Google</Text>
            </>
          )}
        </Pressable>

        <View style={styles.dividerRow}>
          <Divider style={{ flex: 1 }} />
          <Kicker>Or</Kicker>
          <Divider style={{ flex: 1 }} />
        </View>

        <View style={styles.form}>
          {!isLogin && (
            <View style={styles.inputGroup}>
              <Kicker>Display Name</Kicker>
              <View style={styles.inputRow}>
                <UserIcon size={15} color={C.textLight} strokeWidth={1.7} />
                <TextInput
                  placeholder="Anteater Study"
                  placeholderTextColor={C.textLight}
                  style={styles.input}
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
            <Kicker>Email Address</Kicker>
            <View style={styles.inputRow}>
              <Mail size={15} color={C.textLight} strokeWidth={1.7} />
              <TextInput
                placeholder="yourname@uci.edu"
                placeholderTextColor={C.textLight}
                style={styles.input}
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
            <Kicker>Password</Kicker>
            <View style={styles.inputRow}>
              <Lock size={15} color={C.textLight} strokeWidth={1.7} />
              <TextInput
                placeholder="••••••••"
                placeholderTextColor={C.textLight}
                style={styles.input}
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

          <OutlineButton
            label={loading ? 'Signing In…' : isLogin ? 'Sign In' : 'Create Account'}
            onPress={handleAuth}
            disabled={loading}
            style={{ marginTop: SPACING.sm }}
          />
        </View>

        <View style={styles.footer}>
          <Text style={[TYPE.metaSmall, { color: C.textMuted }]}>
            {isLogin ? "Don't have an account?" : 'Already have an account?'}
          </Text>
          <Pressable onPress={toggleMode}>
            <Text style={[TYPE.metaSmall, { color: C.accent700, textDecorationLine: 'underline' }]}>
              {isLogin ? 'Create one' : 'Sign in'}
            </Text>
          </Pressable>
        </View>

        <View style={styles.employeeWrap}>
          <Divider style={{ marginBottom: SPACING.md, width: '100%' }} />
          <Pressable onPress={() => router.push('/employee/login')} style={styles.employeeLink}>
            <Briefcase size={15} color={C.accent700} strokeWidth={1.7} />
            <Text style={[TYPE.metaSmall, { color: C.accent700 }]}>Café Employee Login</Text>
          </Pressable>
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
  logoWrap: {
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  subtitle: {
    color: C.textSecondary,
    textAlign: 'center',
    marginTop: 4,
  },
  messageText: {
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
  googleBtn: {
    minHeight: 48,
    borderRadius: THEME.radius.md,
    borderWidth: 1,
    borderColor: C.hairlineStrong,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginBottom: SPACING.md,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  form: {
    gap: SPACING.md,
  },
  inputGroup: {
    gap: 6,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: C.hairlineStrong,
    paddingBottom: 8,
  },
  input: {
    flex: 1,
    fontFamily: THEME.fonts.body,
    fontSize: 15,
    color: C.text,
    paddingVertical: 4,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: SPACING.lg,
  },
  employeeWrap: {
    marginTop: SPACING.xl,
    alignItems: 'center',
  },
  employeeLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
});
