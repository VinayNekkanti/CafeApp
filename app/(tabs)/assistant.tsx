import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../src/services/supabase';
import { useLocation } from '../../src/context/LocationContext';
import { getCafes, getCafeHoursBatch } from '../../src/services/data';
import { Cafe, CafeHours, StructuredPreferences } from '../../src/types';
import { THEME } from '../../src/constants/theme';
import { rankCafes } from '../../src/utils/recommendation';
import CafeCard from '../../src/components/CafeCard';
import Ionicons from '@expo/vector-icons/Ionicons';

interface Message {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  recommendations?: Cafe[];
  loading?: boolean;
}

export default function AIAssistantScreen() {
  const router = useRouter();
  const colorScheme = (useColorScheme() ?? 'light') as 'light' | 'dark';
  const themeColors = THEME.colors[colorScheme];
  const { location } = useLocation();

  // State
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      sender: 'assistant',
      text: "Hi there! I'm your Café Study Spot Assistant. Describe what you're looking for (e.g. 'I need a quiet place near me with fast Wi-Fi that isn't packed right now') and I'll find the perfect match!",
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [hours, setHours] = useState<Record<string, CafeHours[]>>({});

  const flatListRef = useRef<FlatList>(null);

  const handleSend = async () => {
    if (!inputText.trim()) return;

    const userMessageText = inputText.trim();
    setInputText('');
    setLoading(true);

    const userMsgId = Math.random().toString();
    const assistantMsgId = Math.random().toString();

    // 1. Add user message and temporary loading assistant bubble
    setMessages((prev) => [
      ...prev,
      { id: userMsgId, sender: 'user', text: userMessageText },
      { id: assistantMsgId, sender: 'assistant', text: '', loading: true },
    ]);

    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);

    try {
      // Fetch café hours in batch to ensure ranking works
      const cafesList = await getCafes();
      const cafeIds = cafesList.map((c) => c.id);
      const hoursMap = await getCafeHoursBatch(cafeIds);
      setHours(hoursMap);

      let responseData: { preferences: StructuredPreferences; recommendations: Cafe[]; explanation: string };

      // 2. Attempt Edge Function invocation
      try {
        const { data, error } = await supabase.functions.invoke('recommend-cafes', {
          body: {
            query: userMessageText,
            location: { latitude: location.latitude, longitude: location.longitude },
          },
        });

        if (error || !data) {
          throw new Error(error?.message || 'Edge Function returned empty data');
        }
        responseData = data;
      } catch (edgeErr) {
        console.warn('Edge function failed, running client-side mock AI recommendation:', edgeErr);
        // Fallback to local parsing & ranking
        responseData = runLocalAIEngine(userMessageText, cafesList, hoursMap, location.latitude, location.longitude);
      }

      // 3. Update assistant bubble with actual recommendation results
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMsgId
            ? {
                id: assistantMsgId,
                sender: 'assistant',
                text: responseData.explanation,
                recommendations: responseData.recommendations,
                loading: false,
              }
            : msg
        )
      );
    } catch (err: any) {
      console.error('Error generating AI recommendation:', err);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMsgId
            ? {
                id: assistantMsgId,
                sender: 'assistant',
                text: "I'm sorry, I ran into a connection issue while brewing your recommendations. Please try again in a bit!",
                loading: false,
              }
            : msg
        )
      );
    } finally {
      setLoading(false);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 200);
    }
  };

  /**
   * Mock parser to run recommendations client-side if Supabase Edge Functions aren't linked yet.
   */
  const runLocalAIEngine = (
    query: string,
    cafesList: Cafe[],
    hoursMap: Record<string, CafeHours[]>,
    lat: number,
    lon: number
  ) => {
    const qLower = query.toLowerCase();
    
    // Parse keywords
    const prefs: StructuredPreferences = {};
    if (qLower.includes('wifi') || qLower.includes('internet') || qLower.includes('wi-fi')) {
      prefs.wifi_required = true;
    }
    if (qLower.includes('quiet') || qLower.includes('silent') || qLower.includes('peace')) {
      prefs.quietness = 'Quiet';
    }
    if (qLower.includes('vibe') || qLower.includes('aesthetic') || qLower.includes('cute') || qLower.includes('pretty')) {
      prefs.aesthetics_priority = 'High';
    }
    if (qLower.includes('crowd') || qLower.includes('busy') || qLower.includes('packed') || qLower.includes('empty') || qLower.includes('full')) {
      prefs.preferred_crowd_levels = ['Low', 'Moderate'];
    }
    if (qLower.includes('near') || qLower.includes('close') || qLower.includes('walk') || qLower.includes('minute')) {
      prefs.max_distance = 15;
      prefs.distance_unit = 'minutes';
    }

    // Rank cafes
    const ranked = rankCafes(cafesList, hoursMap, lat, lon, prefs);
    const top3 = ranked.slice(0, 3).map((r) => r.cafe);

    // Create explanation grounded strictly in the cafe data
    let explanation = `Here are my top recommendations based on your preferences:\n\n`;
    
    if (top3.length === 0) {
      explanation = `I scanned all cafes near UCI but couldn't find any that match your criteria. Try adjusting your preferences!`;
    } else {
      top3.forEach((c, index) => {
        const crowd = c.current_crowd_level || 'Low';
        const wifi = c.wifi_available ? `WiFi (${c.wifi_quality || 'Available'})` : 'No WiFi';
        const quiet = c.avg_quietness && c.avg_quietness >= 2.4 ? 'Quiet 🤫' : c.avg_quietness && c.avg_quietness <= 1.6 ? 'Loud 🔊' : 'Moderate 🔉';
        
        explanation += `${index + 1}. **${c.name}** fits well because it has a **${crowd} crowd level**, offers **${wifi}**, and has a **${quiet}** atmosphere according to students.\n\n`;
      });
      
      explanation += `💡 Tap on any café card below to view details, verify opening hours, or check location routing!`;
    }

    return {
      preferences: prefs,
      recommendations: top3,
      explanation,
    };
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        style={styles.keyboardView}
      >
        {/* Messages list */}
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <View
              style={[
                styles.messageRow,
                item.sender === 'user' ? styles.userRow : styles.assistantRow,
              ]}
            >
              {/* Bubble */}
              <View
                style={[
                  styles.bubble,
                  item.sender === 'user'
                    ? { backgroundColor: themeColors.primary, borderBottomRightRadius: 2 }
                    : { backgroundColor: themeColors.surface, borderBottomLeftRadius: 2, borderColor: themeColors.border, borderWidth: 1 },
                ]}
              >
                {item.loading ? (
                  <View style={styles.loadingBubble}>
                    <ActivityIndicator size="small" color={themeColors.primary} />
                    <Text style={[styles.loadingText, { color: themeColors.textMuted }]}>
                      Brewing recommendations...
                    </Text>
                  </View>
                ) : (
                  <Text
                    style={[
                      styles.messageText,
                      { color: item.sender === 'user' ? '#FFF' : themeColors.text },
                    ]}
                  >
                    {item.text}
                  </Text>
                )}
              </View>

              {/* Cafe Recommendations Cards list rendered inside chat bubble */}
              {item.recommendations && item.recommendations.length > 0 && (
                <View style={styles.carouselWrapper}>
                  {item.recommendations.map((cafe: Cafe) => (
                    <View key={cafe.id} style={styles.cardItem}>
                      <CafeCard
                        cafe={cafe}
                        hours={hours[cafe.id] || []}
                        userLat={location.latitude}
                        userLon={location.longitude}
                        onPress={() => router.push(`/cafe/${cafe.id}`)}
                      />
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}
        />

        {/* Input area */}
        <View
          style={[
            styles.inputRow,
            { backgroundColor: themeColors.surface, borderTopColor: themeColors.border },
          ]}
        >
          <TextInput
            placeholder="Type your study needs..."
            placeholderTextColor={themeColors.textLight}
            style={[styles.input, { color: themeColors.text, borderColor: themeColors.border }]}
            value={inputText}
            onChangeText={setInputText}
            editable={!loading}
            onSubmitEditing={handleSend}
          />
          <Pressable
            onPress={handleSend}
            disabled={loading || !inputText.trim()}
            style={({ pressed }) => [
              styles.sendBtn,
              { backgroundColor: themeColors.primary },
              (loading || !inputText.trim()) && { opacity: 0.5 },
              pressed && { opacity: 0.9 },
            ]}
          >
            <Ionicons name="send" size={16} color="#FFF" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  listContent: {
    padding: THEME.spacing.md,
    gap: THEME.spacing.md,
    paddingBottom: 24,
  },
  messageRow: {
    flexDirection: 'column',
    maxWidth: '85%',
  },
  userRow: {
    alignSelf: 'flex-end',
  },
  assistantRow: {
    alignSelf: 'flex-start',
    maxWidth: '92%',
  },
  bubble: {
    paddingHorizontal: THEME.spacing.md,
    paddingVertical: THEME.spacing.sm,
    borderRadius: THEME.roundness.md,
  },
  messageText: {
    fontSize: THEME.typography.sizes.sm,
    lineHeight: 20,
  },
  loadingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: THEME.spacing.sm,
    paddingVertical: 4,
  },
  loadingText: {
    fontSize: 12,
    fontWeight: '500',
  },
  carouselWrapper: {
    marginTop: THEME.spacing.sm,
    width: Dimensions.get('window').width - 32,
    marginLeft: Platform.OS === 'ios' ? 0 : -8,
  },
  cardItem: {
    marginBottom: THEME.spacing.xs,
  },
  inputRow: {
    flexDirection: 'row',
    padding: THEME.spacing.md,
    borderTopWidth: 1,
    gap: THEME.spacing.sm,
    alignItems: 'center',
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: THEME.roundness.full,
    paddingHorizontal: THEME.spacing.lg,
    height: 40,
    fontSize: THEME.typography.sizes.sm,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
