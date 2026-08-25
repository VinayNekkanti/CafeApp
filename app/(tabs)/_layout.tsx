import React from 'react';
import { Tabs, useRouter } from 'expo-router';
import { Image, Platform, Pressable, Text, View, useColorScheme } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { THEME } from '../../src/constants/theme';

export default function TabLayout() {
  const router = useRouter();
  const colorScheme = (useColorScheme() ?? 'light') as 'light' | 'dark';
  const themeColors = THEME.colors[colorScheme];

  const renderHeaderTitle = () => (
    <Pressable
      onPress={() => router.push('/')}
      style={({ pressed }) => [{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginLeft: Platform.OS === 'web' ? 4 : 0,
        opacity: pressed ? 0.8 : 1.0,
        cursor: 'pointer',
      }]}
    >
      <View style={{
        width: 52,
        height: 52,
        borderRadius: 14,
        overflow: 'hidden',
        justifyContent: 'center',
        alignItems: 'center',
      }}>
        <Image
          source={require('../../assets/images/logo.png')}
          style={{
            width: 52,
            height: 52,
            borderRadius: 14,
          }}
          resizeMode="cover"
        />
      </View>
      <Text style={{ fontWeight: '800', color: themeColors.text, fontSize: THEME.typography.sizes.lg + 3, letterSpacing: -0.4 }}>
        FindMyCafe
      </Text>
    </Pressable>
  );

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: themeColors.tabIconSelected,
        tabBarInactiveTintColor: themeColors.tabIconDefault,
        tabBarStyle: {
          backgroundColor: themeColors.surface,
          borderTopColor: themeColors.border,
          borderTopWidth: 1,
          paddingBottom: 5,
          paddingTop: 5,
          height: 60,
        },
        headerStyle: {
          backgroundColor: themeColors.surface,
          borderBottomColor: themeColors.border,
          borderBottomWidth: 1,
          height: 80,
        },
        headerTitleStyle: {
          fontWeight: 'bold',
          color: themeColors.text,
          fontSize: THEME.typography.sizes.lg,
        },
        headerTitleAlign: 'left',
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Explore',
          headerTitle: renderHeaderTitle,
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'compass' : 'compass-outline'}
              size={24}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="assistant"
        options={{
          title: 'AI Assistant',
          headerTitle: renderHeaderTitle,
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'sparkles' : 'sparkles-outline'}
              size={24}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          headerTitle: renderHeaderTitle,
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'person' : 'person-outline'}
              size={24}
              color={color}
            />
          ),
        }}
      />
    </Tabs>
  );
}
