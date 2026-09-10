import React from 'react';
import { Image, ImageSourcePropType, Pressable, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';
import { COLORS, RADIUS, SPACING, TYPE } from '../constants/theme';

/** Every structural line in the app. Never a border on a card. */
export function Divider({ style }: { style?: ViewStyle }) {
  return <View style={[{ height: Math.max(StyleSheet.hairlineWidth, 1), backgroundColor: COLORS.divider }, style]} />;
}

/** The uppercase label that opens every section. */
export function Kicker({ children, tone = 'muted', style }: {
  children: React.ReactNode;
  tone?: 'muted' | 'accent' | 'secondary';
  style?: TextStyle;
}) {
  const color = tone === 'accent' ? COLORS.accent700 : tone === 'secondary' ? COLORS.textSecondary : COLORS.textMuted;
  return <Text style={[TYPE.kicker, { color }, style]}>{children}</Text>;
}

/**
 * Crowd level as ten steps — replaces the old colored crowd pill.
 * Always pair with the numeric label; the meter alone is not accessible.
 */
export function CrowdMeter({ level, size = 9 }: { level: number; size?: number }) {
  const gap = size <= 6 ? 2.5 : 4;
  return (
    <View
      style={{ flexDirection: 'row', gap }}
      accessibilityRole="progressbar"
      accessibilityLabel={`Crowd level ${level} of 10`}
    >
      {Array.from({ length: 10 }, (_, i) => (
        <View
          key={i}
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: 1,
            borderColor: i < level ? COLORS.accent700 : COLORS.hairlineStrong,
            backgroundColor: i < level ? COLORS.accent700 : 'transparent',
          }}
        />
      ))}
    </View>
  );
}

/** The only button in the system: an outline. There is no filled variant. */
export function OutlineButton({ label, onPress, variant = 'primary', disabled, style }: {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const primary = variant === 'primary';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [
        {
          minHeight: 48,
          borderRadius: RADIUS.md,
          borderWidth: 1,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: SPACING.lg,
          borderColor: disabled ? COLORS.hairlineStrong : primary ? COLORS.accent : COLORS.hairlineStrong,
          backgroundColor: pressed && !disabled ? (primary ? COLORS.accent100 : COLORS.surface) : 'transparent',
          opacity: disabled ? 0.45 : 1,
        },
        style,
      ]}
    >
      <Text style={[TYPE.kicker, { fontSize: 13, color: disabled ? COLORS.textLight : primary ? COLORS.accent700 : COLORS.text }]}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Filter chips and the noise picker. 44pt minimum. */
export function Chip({ label, active, onPress, style }: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  style?: ViewStyle;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      style={({ pressed }) => [
        {
          minHeight: 44,
          paddingHorizontal: 13,
          borderRadius: RADIUS.md,
          borderWidth: 1,
          alignItems: 'center',
          justifyContent: 'center',
          borderColor: active ? COLORS.accent : COLORS.divider,
          backgroundColor: active ? COLORS.accent100 : pressed ? COLORS.surface : 'transparent',
        },
        style,
      ]}
    >
      <Text style={[TYPE.kicker, { color: active ? COLORS.accent700 : COLORS.textSecondary }]}>{label}</Text>
    </Pressable>
  );
}

/**
 * The image mat — every café photo goes through this, so photographs read as
 * tipped-in plates rather than banners. `hatch` is the placeholder tile asset.
 */
export function Plate({ size, source, style, children }: {
  size?: number;
  source?: ImageSourcePropType | null;
  style?: ViewStyle;
  children?: React.ReactNode;
}) {
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          padding: size && size <= 56 ? 3 : 4,
          borderWidth: 1,
          borderColor: COLORS.divider,
          borderRadius: RADIUS.sm,
          backgroundColor: COLORS.surface,
        },
        style,
      ]}
    >
      {source ? (
        <Image source={source} resizeMode="cover" style={{ width: '100%', height: '100%' }} />
      ) : (
        <View style={{ flex: 1, backgroundColor: '#e1d9cc' }}>{children}</View>
      )}
    </View>
  );
}
