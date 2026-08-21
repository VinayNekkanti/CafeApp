import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { THEME } from '../constants/theme';

interface LoadingScreenProps {
  message?: string;
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({ message = 'Brewing your coffee spot list...' }) => {
  const colorScheme = (useColorScheme() ?? 'light') as 'light' | 'dark';
  const themeColors = THEME.colors[colorScheme];

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      <ActivityIndicator size="large" color={themeColors.primary} />
      <Text style={[styles.message, { color: themeColors.textMuted }]}>{message}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: THEME.spacing.lg,
  },
  message: {
    marginTop: THEME.spacing.md,
    fontSize: THEME.typography.sizes.md,
    fontWeight: '500',
    textAlign: 'center',
  },
});
export default LoadingScreen;
