import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { supabase } from '../../src/services/supabase';
import LoadingScreen from '../../src/components/LoadingScreen';

export default function AuthCallbackScreen() {
  useEffect(() => {
    const processCallback = async () => {
      try {
        if (typeof window !== 'undefined' && window.location.href) {
          const url = window.location.href;
          const urlObj = new URL(url);
          const code = urlObj.searchParams.get('code');
          const hash = urlObj.hash;

          if (code) {
            await supabase.auth.exchangeCodeForSession(code);
          } else if (hash && hash.includes('access_token')) {
            const params = new URLSearchParams(hash.substring(1));
            const access_token = params.get('access_token');
            const refresh_token = params.get('refresh_token');
            if (access_token && refresh_token) {
              await supabase.auth.setSession({ access_token, refresh_token });
            }
          }
        }
      } catch (err) {
        console.error('Error in AuthCallbackScreen:', err);
      }
    };

    processCallback();
  }, []);

  return <LoadingScreen message="Completing Google Sign In..." />;
}
