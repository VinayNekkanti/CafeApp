import React from 'react';
import { Tabs } from 'expo-router';
import { Pressable, Text, GestureResponderEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MapPin, MessageSquare, User } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { THEME } from '../../src/constants/theme';

const { colors: C, type: TYPE } = THEME;

/**
 * A tab's whole active affordance is a 2px accent rule on its own top edge —
 * no pill, no background fill. See design handoff README, "Tab bar".
 */
function makeTabButton(Icon: LucideIcon, label: string) {
  return function TabButton({
    onPress,
    accessibilityState,
  }: {
    onPress?: (e: GestureResponderEvent) => void;
    accessibilityState?: { selected?: boolean };
  }) {
    const focused = !!accessibilityState?.selected;
    const tint = focused ? C.accent700 : C.textLight;
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityState={{ selected: focused }}
        style={{
          flex: 1,
          minHeight: 52,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 4,
          borderTopWidth: 2,
          borderTopColor: focused ? C.accent : 'transparent',
        }}
      >
        <Icon size={19} color={tint} strokeWidth={1.6} />
        <Text style={[TYPE.tab, { color: tint }]}>{label}</Text>
      </Pressable>
    );
  };
}

export default function TabLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: C.bg,
          borderTopWidth: 1,
          borderTopColor: C.divider,
          paddingTop: 8,
          paddingBottom: Math.max(insets.bottom, 8),
          height: 52 + 8 + Math.max(insets.bottom, 8),
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Explore',
          tabBarButton: makeTabButton(MapPin, 'Explore'),
        }}
      />
      <Tabs.Screen
        name="assistant"
        options={{
          title: 'Assistant',
          tabBarButton: makeTabButton(MessageSquare, 'Assistant'),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarButton: makeTabButton(User, 'Profile'),
        }}
      />
    </Tabs>
  );
}
