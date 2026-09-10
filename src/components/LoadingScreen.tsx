import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { THEME } from '../constants/theme';

interface LoadingScreenProps {
  message?: string;
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({ message = 'Brewing your coffee spot list...' }) => {
  const themeColors = THEME.colors;

  return (
    <View style={[styles.container, { backgroundColor: themeColors.bg }]}>
      <ActivityIndicator size="large" color={themeColors.accent700} />
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
    ...THEME.type.body,
    textAlign: 'center',
  },
});
export default LoadingScreen;
