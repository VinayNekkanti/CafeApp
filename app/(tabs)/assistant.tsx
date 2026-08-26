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
import { calculateDistance } from '../../src/utils/distance';
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
  const [lastPreferences, setLastPreferences] = useState<StructuredPreferences | null>(null);

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

      let responseData: { preferences: StructuredPreferences; recommendations: Cafe[]; explanation: string; is_exact_match?: boolean };

      // 2. Attempt Edge Function invocation with fallback
      try {
        const { data, error } = await supabase.functions.invoke('recommend-cafes', {
          body: {
            query: userMessageText,
            location: { latitude: location.latitude, longitude: location.longitude },
            history: messages.map((m) => ({ sender: m.sender, text: m.text })),
            lastPreferences,
          },
        });

        if (error || !data) {
          throw new Error(error?.message || 'Edge Function returned empty data');
        }
        responseData = data;
        if (responseData.preferences) {
          setLastPreferences(responseData.preferences);
        }

        console.log('[AI] mode=OPENAI payload=', JSON.stringify({
          intent: responseData.preferences?.intent || 'recommend_cafe',
          max_results: responseData.preferences?.max_results || 3,
          filters: responseData.preferences,
          candidate_count: responseData.recommendations?.length || 0,
          selected_cafe_ids: (responseData.recommendations || []).map((c: any) => c.id),
          ai_mode: 'OPENAI',
        }));
      } catch (edgeErr: any) {
        console.warn(`[AI] mode=LOCAL_FALLBACK reason="${edgeErr.message || 'Edge Function error'}"`);
        responseData = await runLocalAIEngine(userMessageText, cafesList, hoursMap, location.latitude, location.longitude, messages, lastPreferences);
        if (responseData.preferences) {
          setLastPreferences(responseData.preferences);
        }
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
   * Client-side fallback rule-based NLP ranking engine
   */
  const runLocalAIEngine = async (
    query: string,
    cafesList: Cafe[],
    hoursMap: Record<string, CafeHours[]>,
    lat: number,
    lon: number,
    historyMessages: Message[],
    prevPrefs?: StructuredPreferences | null
  ) => {
    const qTrim = query.trim().toLowerCase();

    // Check greeting / non-search message
    if (qTrim === 'hi' || qTrim === 'hello' || qTrim === 'hey' || qTrim.includes('what can you do') || qTrim === 'thanks' || qTrim === 'thank you') {
      const prefs: StructuredPreferences = { intent: 'general_chat' };
      console.log('[AI] mode=LOCAL_FALLBACK payload=', JSON.stringify({
        intent: 'general_chat',
        max_results: 0,
        filters: {},
        candidate_count: cafesList.length,
        selected_cafe_ids: [],
        ai_mode: 'LOCAL_FALLBACK',
      }));

      return {
        preferences: prefs,
        recommendations: [],
        explanation: "Hi! Tell me what kind of FindMyCafe location you're looking for — for example, quiet, close by, good Wi-Fi, or not too crowded.",
      };
    }

    const isModify = qTrim.includes('only') || qTrim.includes('just') || qTrim.startsWith('which') || qTrim.includes('make it') || qTrim.includes('actually');
    const prefs: StructuredPreferences = {
      ...(prevPrefs || {}),
      intent: isModify ? 'modify_recommendation' : 'recommend_cafe',
    };

    // Result count parsing
    if (qTrim.includes('1') || qTrim.includes('one') || qTrim.includes('single') || qTrim.includes('closest cafe')) {
      prefs.max_results = 1;
    } else if (qTrim.includes('2') || qTrim.includes('two') || qTrim.includes('pair')) {
      prefs.max_results = 2;
    } else if (qTrim.includes('3') || qTrim.includes('three')) {
      prefs.max_results = 3;
    } else if (!prefs.max_results) {
      prefs.max_results = 3;
    }

    // Distance parsing
    if (qTrim.includes('1 mile') || qTrim.includes('within 1')) {
      prefs.max_distance_miles = 1;
    } else if (qTrim.includes('2 mile') || qTrim.includes('within 2')) {
      prefs.max_distance_miles = 2;
    } else if (qTrim.includes('3 mile') || qTrim.includes('within 3')) {
      prefs.max_distance_miles = 3;
    }

    // Sort & filter parsing
    if (qTrim.includes('closest') || qTrim.includes('nearest') || qTrim.includes('close') || qTrim.includes('nearby')) {
      prefs.sort_by = 'distance';
    } else if (qTrim.includes('least crowded') || qTrim.includes('unpacked') || qTrim.includes('not crowded') || qTrim.includes('empty') || qTrim.includes('less crowded')) {
      prefs.sort_by = 'crowd';
      prefs.preferred_crowd_levels = ['Low', 'Moderate'];
    } else if (qTrim.includes('quiet') || qTrim.includes('silent') || qTrim.includes('peace')) {
      prefs.sort_by = 'quietness';
      prefs.quietness = 'Quiet';
    }

    if (qTrim.includes('wifi') || qTrim.includes('internet') || qTrim.includes('wi-fi')) {
      prefs.wifi_required = true;
    }

    const ranked = rankCafes(cafesList, hoursMap, lat, lon, prefs);
    const finalRecommendations = ranked.map((r) => r.cafe);

    console.log('[AI] mode=LOCAL_FALLBACK payload=', JSON.stringify({
      intent: prefs.intent,
      max_results: prefs.max_results,
      filters: prefs,
      candidate_count: cafesList.length,
      selected_cafe_ids: finalRecommendations.map((c) => c.id),
      ai_mode: 'LOCAL_FALLBACK',
    }));

    let explanation = '';
    if (finalRecommendations.length === 0) {
      explanation = "I scanned all FindMyCafe locations near UCI but couldn't find any matching your exact criteria. Try broadening your request!";
    } else if (finalRecommendations.length === 1) {
      const c = finalRecommendations[0];
      const crowd = c.current_crowd_level || 'Low';
      const wifi = c.wifi_available ? `Wi-Fi (${c.wifi_quality || 'Available'})` : 'No Wi-Fi';
      explanation = `Here is the top match for your request:\n\n1. **${c.name}** — **${crowd} crowd level**, **${wifi}**, located at **${c.address}**.\n\n💡 Tap on the card below to view full details or navigate there!`;
    } else {
      explanation = `Here are the top ${finalRecommendations.length} recommendations based on your request:\n\n`;
      finalRecommendations.forEach((c, index) => {
        const crowd = c.current_crowd_level || 'Low';
        const wifi = c.wifi_available ? `Wi-Fi (${c.wifi_quality || 'Available'})` : 'No Wi-Fi';
        explanation += `${index + 1}. **${c.name}** — **${crowd} crowd level**, **${wifi}**.\n\n`;
      });
      explanation += `💡 Tap on any café card below to view details, verify hours, or check location routing!`;
    }

    return {
      preferences: prefs,
      recommendations: finalRecommendations,
      explanation,
    };

    return {
      preferences: prefs,
      recommendations: finalRecommendations,
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
