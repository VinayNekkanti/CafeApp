import React, { createContext, useContext, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { supabase } from '../services/supabase';
import { Session, User } from '@supabase/supabase-js';
import { Profile } from '../types';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';

WebBrowser.maybeCompleteAuthSession();

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  isProfileComplete: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const checkIsProfileComplete = (prof: Profile | null): boolean => {
  if (!prof) return false;
  const firstName = prof.first_name?.trim();
  const lastName = prof.last_name?.trim();
  const phone = prof.phone_number?.trim();
  return Boolean(firstName && lastName && phone);
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isProfileComplete, setIsProfileComplete] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (userId: string): Promise<Profile | null> => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();
      
      if (error) {
        console.error('Error fetching profile:', error);
        setProfile(null);
        setIsProfileComplete(false);
        return null;
      } else if (data) {
        const prof = data as Profile;
        setProfile(prof);
        setIsProfileComplete(checkIsProfileComplete(prof));
        return prof;
      } else {
        setProfile(null);
        setIsProfileComplete(false);
        return null;
      }
    } catch (err) {
      console.error('Error in fetchProfile:', err);
      setProfile(null);
      setIsProfileComplete(false);
      return null;
    }
  };

  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user.id);
    }
  };

  const handleAuthUrl = async (url: string) => {
    try {
      const parsed = Linking.parse(url);
      const queryParams = parsed.queryParams || {};

      if (queryParams.access_token && queryParams.refresh_token) {
        const { data, error } = await supabase.auth.setSession({
          access_token: queryParams.access_token as string,
          refresh_token: queryParams.refresh_token as string,
        });
        if (error) throw error;
        if (data?.session?.user) {
          await fetchProfile(data.session.user.id);
        }
      } else if (queryParams.code) {
        const { data, error } = await supabase.auth.exchangeCodeForSession(queryParams.code as string);
        if (error) throw error;
        if (data?.session?.user) {
          await fetchProfile(data.session.user.id);
        }
      }
    } catch (err) {
      console.error('Error establishing session from URL:', err);
    }
  };

  useEffect(() => {
    // Listen for incoming deep links
    const subscription = Linking.addEventListener('url', (event) => {
      if (event.url) {
        handleAuthUrl(event.url);
      }
    });

    // Initial session loading
    const initAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          await fetchProfile(session.user.id);
        }
      } catch (err) {
        console.error('Error restoring session:', err);
      } finally {
        setLoading(false);
      }
    };

    initAuth();

    // Listen for auth state changes
    const { data: { subscription: authSub } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        await fetchProfile(session.user.id);
      } else {
        setProfile(null);
        setIsProfileComplete(false);
      }
      setLoading(false);
    });

    return () => {
      subscription.remove();
      authSub.unsubscribe();
    };
  }, []);

  const signInWithGoogle = async () => {
    const redirectUrl = Linking.createURL('auth/callback');
    
    if (Platform.OS === 'web') {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : redirectUrl,
        },
      });
      if (error) throw error;
    } else {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: true,
        },
      });
      if (error) throw error;

      if (data?.url) {
        const res = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);
        if (res.type === 'success' && res.url) {
          await handleAuthUrl(res.url);
        }
      }
    }
  };

  const signOut = async () => {
    setLoading(true);
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setProfile(null);
    setIsProfileComplete(false);
    setLoading(false);
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        profile,
        loading,
        isProfileComplete,
        signOut,
        refreshProfile,
        signInWithGoogle,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
