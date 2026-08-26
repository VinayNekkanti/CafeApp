import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { query, location, history, lastPreferences } = await req.json();

    if (!query) {
      return new Response(JSON.stringify({ error: 'Query is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userLat = location?.latitude ?? 33.6405;
    const userLon = location?.longitude ?? -117.8443;

    // 1. Initialize Supabase Client
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 2. Fetch cafes & hours from DB
    const { data: cafes, error: cafesError } = await supabase
      .from('v_cafes_with_ratings')
      .select('*');

    if (cafesError) throw cafesError;

    const { data: hours, error: hoursError } = await supabase
      .from('cafe_hours')
      .select('*');

    if (hoursError) throw hoursError;

    const hoursMap: Record<string, any[]> = {};
    hours.forEach((h: any) => {
      if (!hoursMap[h.cafe_id]) {
        hoursMap[h.cafe_id] = [];
      }
      hoursMap[h.cafe_id].push(h);
    });

    const openAiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openAiApiKey) {
      throw new Error('OPENAI_API_KEY is not configured on the server.');
    }

    const model = 'gpt-5.6-luna';

    // Build context-aware prompt using lastPreferences and recent message turns
    const recentTurns = (history || []).slice(-4).map((m: any) => `${m.sender}: ${m.text}`).join('\n');

    const extractSystemPrompt = `You are an AI Assistant for UC Irvine students seeking café study spots.
Classify the user message into one of these intents:
- "general_chat": Casual greetings or non-recommendation remarks (e.g. "hi", "hello", "thanks", "what can you do?")
- "recommend_cafe": A new request for café recommendations
- "modify_recommendation": Modifying a prior recommendation (e.g. "only give me one", "make it closer", "somewhere less crowded")
- "clarification": Asking for details or clarifying a prior answer

Return JSON strictly matching this schema:
{
  "intent": "general_chat" | "recommend_cafe" | "modify_recommendation" | "clarification",
  "max_results": integer (1, 2, or 3. Default 3. "give me one" -> 1, "show two" -> 2),
  "wifi_required": boolean or null,
  "max_distance_miles": number or null (e.g. "within 2 miles" -> 2),
  "open_now_required": boolean or null,
  "crowd_preference": Array of ("Low" | "Moderate" | "Busy" | "Full") or null,
  "quietness": ("Quiet" | "Moderate" | "Loud") or null,
  "sort_by": ("distance" | "crowd" | "quietness" | "aesthetics" | "rating" | "default") or null
}

Rules:
1. Greetings ("hi", "hello", "thanks") MUST have intent = "general_chat" and max_results = 0.
2. If previous preferences exist (${JSON.stringify(lastPreferences || {})}), preserve them unless the user explicitly overrides them.`;

    let preferences: any = { intent: 'recommend_cafe', max_results: 3 };

    // Try OpenAI Responses API (/v1/responses), fallback to Chat Completions if needed
    try {
      const responseRes = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openAiApiKey}`,
        },
        body: JSON.stringify({
          model,
          input: [
            { role: 'system', content: extractSystemPrompt },
            { role: 'user', content: `Recent context:\n${recentTurns}\n\nCurrent user message: "${query}"` },
          ],
          response_format: { type: 'json_object' },
        }),
      });

      if (responseRes.ok) {
        const resData = await responseRes.json();
        const outputText = resData.output?.[0]?.message?.content || resData.choices?.[0]?.message?.content || resData.output_text;
        if (outputText) {
          preferences = JSON.parse(outputText);
        }
      } else {
        // Fallback to Chat Completions API
        const chatRes = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${openAiApiKey}`,
          },
          body: JSON.stringify({
            model,
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: extractSystemPrompt },
              { role: 'user', content: `Recent context:\n${recentTurns}\n\nCurrent user message: "${query}"` },
            ],
          }),
        });

        if (chatRes.ok) {
          const chatData = await chatRes.json();
          preferences = JSON.parse(chatData.choices[0].message.content);
        }
      }
    } catch (e) {
      console.warn('OpenAI preference extraction API call error, using local parsing:', e);
    }

    // Merge previous preferences if intent is modify_recommendation
    if (preferences.intent === 'modify_recommendation' && lastPreferences) {
      preferences = {
        ...lastPreferences,
        ...preferences,
        wifi_required: preferences.wifi_required ?? lastPreferences.wifi_required,
        max_distance_miles: preferences.max_distance_miles ?? lastPreferences.max_distance_miles,
        open_now_required: preferences.open_now_required ?? lastPreferences.open_now_required,
        crowd_preference: preferences.crowd_preference ?? lastPreferences.crowd_preference,
      };
    }

    // Handle General Chat (no cards)
    if (preferences.intent === 'general_chat') {
      const debugLog = {
        intent: 'general_chat',
        max_results: 0,
        filters: {},
        candidate_count: cafes.length,
        selected_cafe_ids: [],
        ai_mode: 'OPENAI',
      };
      console.log('[AI] mode=OPENAI payload=', JSON.stringify(debugLog));

      return new Response(
        JSON.stringify({
          preferences,
          recommendations: [],
          explanation: "Hi! Tell me what kind of study spot you're looking for — for example, quiet, close by, good Wi-Fi, or not too crowded.",
          is_exact_match: true,
          ai_mode: 'OPENAI',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Deterministic Hard Filtering & Scoring
    let isExactMatch = true;
    let scoredCafes = cafes
      .map((cafe: any) => {
        const cafeHours = hoursMap[cafe.id] || [];
        const scoreResult = calculateScoreLocally(cafe, cafeHours, userLat, userLon, preferences, true);
        return {
          cafe,
          score: scoreResult.score,
          reasons: scoreResult.reasons,
          excluded: scoreResult.excluded,
          distanceMiles: getDistance(userLat, userLon, cafe.latitude, cafe.longitude),
        };
      })
      .filter((c: any) => !c.excluded);

    // Zero match compromise fallback
    if (scoredCafes.length === 0) {
      isExactMatch = false;
      scoredCafes = cafes.map((cafe: any) => {
        const cafeHours = hoursMap[cafe.id] || [];
        const scoreResult = calculateScoreLocally(cafe, cafeHours, userLat, userLon, preferences, false);
        return {
          cafe,
          score: scoreResult.score,
          reasons: scoreResult.reasons,
          excluded: false,
          distanceMiles: getDistance(userLat, userLon, cafe.latitude, cafe.longitude),
        };
      });
    }

    // Sorting candidates
    scoredCafes.sort((a: any, b: any) => {
      if (preferences.sort_by === 'distance') {
        return a.distanceMiles - b.distanceMiles;
      }
      if (preferences.sort_by === 'crowd') {
        const crowdRank: Record<string, number> = { Low: 1, Moderate: 2, Busy: 3, Full: 4 };
        const rankA = crowdRank[a.cafe.current_crowd_level || 'Low'] || 1;
        const rankB = crowdRank[b.cafe.current_crowd_level || 'Low'] || 1;
        if (rankA !== rankB) return rankA - rankB;
      }
      if (preferences.sort_by === 'quietness') {
        const quietA = Number(a.cafe.avg_quietness) || 0;
        const quietB = Number(b.cafe.avg_quietness) || 0;
        if (quietA !== quietB) return quietB - quietA;
      }
      return b.score - a.score;
    });

    const maxResults = Math.min(Math.max(preferences.max_results || 3, 1), 3);
    const topCafes = scoredCafes.slice(0, maxResults).map((c: any) => c.cafe);

    const debugLog = {
      intent: preferences.intent || 'recommend_cafe',
      max_results: maxResults,
      filters: {
        wifi_required: preferences.wifi_required,
        max_distance_miles: preferences.max_distance_miles,
        open_now_required: preferences.open_now_required,
        crowd_preference: preferences.crowd_preference,
      },
      candidate_count: cafes.length,
      selected_cafe_ids: topCafes.map((c: any) => c.id),
      ai_mode: 'OPENAI',
      is_exact_match: isExactMatch,
    };
    console.log('[AI] mode=OPENAI payload=', JSON.stringify(debugLog));

    // Explanation Generation Call (Single concise explanation pass)
    let explanation = '';
    const explainPrompt = `You are the Café Study Spot Assistant for UC Irvine students.
Explain the recommended study spots to the user in 100-200 tokens.

User query: "${query}"
Is exact match: ${isExactMatch}
Cafés facts: ${JSON.stringify(topCafes.map((c: any) => ({
  name: c.name,
  address: c.address,
  wifi: c.wifi_available ? (c.wifi_quality || 'Available') : 'None',
  crowd: c.current_crowd_level || 'Low',
})))}

Rules:
1. ONLY state verified database facts provided above. Never invent hours or speeds.
2. If is exact match is false, clearly state: "I couldn't find an exact match for all requirements in our database, but here is the best available alternative:"
3. Keep explanation concise (100-200 tokens).`;

    try {
      const explainRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openAiApiKey}`,
        },
        body: JSON.stringify({
          model,
          max_tokens: 250,
          messages: [
            { role: 'system', content: 'You explain cafe recommendations using database facts only.' },
            { role: 'user', content: explainPrompt },
          ],
        }),
      });

      if (explainRes.ok) {
        const explainData = await explainRes.json();
        explanation = explainData.choices[0]?.message?.content || '';
      }
    } catch (e) {
      console.warn('Explanation generation API error:', e);
    }

    if (!explanation) {
      if (!isExactMatch) {
        explanation = `I couldn't find a café in our current database that matches all of those requirements, but here is the closest compromise option:\n\n`;
      } else {
        explanation = `Here are your top ${topCafes.length} café study spot recommendations:\n\n`;
      }
      topCafes.forEach((c: any, index: number) => {
        const crowd = c.current_crowd_level || 'Low';
        const wifi = c.wifi_available ? `Wi-Fi (${c.wifi_quality || 'Available'})` : 'No Wi-Fi';
        explanation += `${index + 1}. **${c.name}** — **${crowd} crowd level**, **${wifi}**.\n`;
      });
    }

    return new Response(
      JSON.stringify({
        preferences,
        recommendations: topCafes,
        explanation,
        is_exact_match: isExactMatch,
        ai_mode: 'OPENAI',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function calculateScoreLocally(cafe: any, hours: any[], userLat: number, userLon: number, prefs: any, enforceHardFilters = true) {
  let excluded = false;
  const distanceMiles = getDistance(userLat, userLon, cafe.latitude, cafe.longitude);
  const maxDistLimit = prefs?.max_distance_miles ?? prefs?.max_distance;

  if (enforceHardFilters) {
    if (prefs?.wifi_required && !cafe.wifi_available) {
      excluded = true;
    }
    if (maxDistLimit && distanceMiles > maxDistLimit) {
      excluded = true;
    }
    const isNowRequired = prefs?.open_now_required ?? prefs?.open_now;
    if (isNowRequired) {
      const day = new Date().getDay();
      const openHours = hours.filter((h: any) => h.day_of_week === day);
      if (openHours.length === 0) excluded = true;
    }
  }

  if (excluded) return { score: 0, reasons: [], excluded: true };

  let distScore = 100;
  if (distanceMiles > 0.2) {
    distScore = Math.max(0, 100 - ((distanceMiles - 0.2) / 4.8) * 100);
  }

  let crowdScore = 50;
  if (cafe.current_crowd_level === 'Low') crowdScore = 100;
  else if (cafe.current_crowd_level === 'Moderate') crowdScore = 75;
  else if (cafe.current_crowd_level === 'Busy') crowdScore = 35;
  else if (cafe.current_crowd_level === 'Full') crowdScore = 5;

  const quietVal = Number(cafe.avg_quietness) || 0;
  const quietScore = quietVal > 0 ? ((quietVal - 1) / 2) * 100 : 50;

  const aesVal = Number(cafe.avg_aesthetics) || 0;
  const aesScore = aesVal > 0 ? ((aesVal - 1) / 4) * 100 : 50;

  let wifiScore = 0;
  if (cafe.wifi_available) {
    if (cafe.wifi_quality === 'Excellent') wifiScore = 100;
    else if (cafe.wifi_quality === 'Good') wifiScore = 80;
    else if (cafe.wifi_quality === 'Poor') wifiScore = 40;
    else wifiScore = 70;
  }

  const finalScore = distScore * 0.25 + crowdScore * 0.20 + quietScore * 0.20 + aesScore * 0.15 + wifiScore * 0.10 + 100 * 0.10;

  return {
    score: Math.round(finalScore),
    reasons: [],
    excluded: false,
  };
}

function getDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
