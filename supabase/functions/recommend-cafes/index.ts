import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { query, location } = await req.json();

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

    // 2. Fetch all cafes and hours from DB
    const { data: cafes, error: cafesError } = await supabase
      .from('v_cafes_with_ratings')
      .select('*');

    if (cafesError) throw cafesError;

    const { data: hours, error: hoursError } = await supabase
      .from('cafe_hours')
      .select('*');

    if (hoursError) throw hoursError;

    const hoursMap = {};
    hours.forEach((h) => {
      if (!hoursMap[h.cafe_id]) {
        hoursMap[h.cafe_id] = [];
      }
      hoursMap[h.cafe_id].push(h);
    });

    // 3. Connect to OpenAI to extract structured intent & preferences
    const openAiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openAiApiKey) {
      throw new Error('OPENAI_API_KEY is not configured on the server.');
    }

    const model = 'gpt-4o-mini';
    const openaiUrl = 'https://api.openai.com/v1/chat/completions';

    const systemPrompt = `You are an AI assistant that classifies intent and extracts structured preferences from a student's natural language request for a study spot near UC Irvine.

Return JSON strictly matching this schema:
{
  "intent": "general_chat" | "recommend_cafe" | "modify_recommendation",
  "max_results": number (optional, integer 1, 2, or 3. E.g. "give me one cafe" -> 1, "give me 2 cafes" -> 2),
  "sort_by": "distance" | "crowd" | "quietness" | "aesthetics" | "default" (optional),
  "max_distance": number (optional, max distance in miles or minutes),
  "distance_unit": "miles" | "minutes" (optional),
  "wifi_required": boolean (optional),
  "preferred_crowd_levels": Array of "Low" | "Moderate" | "Busy" | "Full" (optional),
  "quietness": "Quiet" | "Moderate" | "Loud" (optional),
  "aesthetics_priority": "Low" | "Medium" | "High" (optional)
}

Rules:
1. If the input is a greeting or general remark (e.g. "hi", "hello", "thanks", "how are you"), set intent = "general_chat" and max_results = 0.
2. If the user asks for a specific quantity (e.g. "give me 1 cafe", "only 1", "closest cafe"), set max_results = 1.
3. If the user asks to modify a previous recommendation (e.g. "only give me 1", "which of those is closest"), set intent = "modify_recommendation".`;

    const extractResponse = await fetch(openaiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openAiApiKey}`,
      },
      body: JSON.stringify({
        model,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Analyze request: "${query}"` },
        ],
      }),
    });

    const extractResult = await extractResponse.json();
    const extractedText = extractResult.choices[0].message.content;
    const preferences = JSON.parse(extractedText);

    // Intent Handling: General Chat
    if (preferences.intent === 'general_chat') {
      console.log('[Edge Function DEBUG]');
      console.log('Current user message:', query);
      console.log('Parsed intent: general_chat');
      console.log('Parsed preferences:', preferences);
      console.log('Requested result count: 0');
      console.log('Candidate cafe count:', cafes.length);
      console.log('Ranked cafe names: []');
      console.log('Final returned cafe count: 0');

      return new Response(
        JSON.stringify({
          preferences,
          recommendations: [],
          explanation: "Hi! Tell me what kind of study spot you're looking for — for example, quiet, close by, good Wi-Fi, or not too crowded.",
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 4. Run Deterministic Scoring & Sorting
    const scoredCafes = cafes.map((cafe) => {
      const cafeHours = hoursMap[cafe.id] || [];
      const scoreResult = calculateScoreLocally(cafe, cafeHours, userLat, userLon, preferences);
      return {
        cafe,
        score: scoreResult.score,
        reasons: scoreResult.reasons,
        excluded: scoreResult.excluded,
        distanceMiles: getDistance(userLat, userLon, cafe.latitude, cafe.longitude),
      };
    }).filter((c) => !c.excluded);

    // Dynamic sorting based on preferences.sort_by
    scoredCafes.sort((a, b) => {
      if (preferences.sort_by === 'distance') {
        return a.distanceMiles - b.distanceMiles;
      }
      if (preferences.sort_by === 'crowd') {
        const crowdRank = { Low: 1, Moderate: 2, Busy: 3, Full: 4 };
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

    const resultCount = Math.min(Math.max(preferences.max_results || 3, 1), 3);
    const topCafes = scoredCafes.slice(0, resultCount).map((c) => c.cafe);

    console.log('[Edge Function DEBUG]');
    console.log('Current user message:', query);
    console.log('Parsed intent:', preferences.intent || 'recommend_cafe');
    console.log('Parsed preferences:', preferences);
    console.log('Requested result count:', resultCount);
    console.log('Candidate cafe count:', cafes.length);
    console.log('Ranked cafe names:', topCafes.map((c) => c.name));
    console.log('Final returned cafe count:', topCafes.length);

    // 5. Ask OpenAI to write a grounded natural language explanation
    const explainPrompt = `You are the Café Study Spot AI Assistant for UC Irvine students.
Given the user's request, the extracted preferences, and the top ${topCafes.length} matched cafés, explain why these cafés are recommended.
Rules:
1. ONLY use the provided café facts. Do not invent coordinates, hours, Wi-Fi speeds, names, or features.
2. If Wi-Fi is unavailable or crowd status is not reported, state that.
3. Be concise and student-friendly.

User query: "${query}"
Extracted preferences: ${JSON.stringify(preferences)}
Cafes details: ${JSON.stringify(topCafes)}`;

    const explainResponse = await fetch(openaiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openAiApiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: 'You explain cafe recommendations to students using only verified database facts.' },
          { role: 'user', content: explainPrompt },
        ],
      }),
    });

    const explainResult = await explainResponse.json();
    const explanation = explainResult.choices[0]?.message?.content || 'Here are your top recommendations:';

    // 6. Return response
    return new Response(
      JSON.stringify({
        preferences,
        recommendations: topCafes,
        explanation,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Helper for local scoring on the server
function calculateScoreLocally(cafe, hours, userLat, userLon, prefs) {
  let excluded = false;
  const reasons = [];

  // Wifi filter
  if (prefs?.wifi_required && !cafe.wifi_available) {
    excluded = true;
  }

  if (excluded) return { score: 0, reasons, excluded: true };

  // Calculate distance
  const distanceMiles = getDistance(userLat, userLon, cafe.latitude, cafe.longitude);
  let distScore = 100;
  if (distanceMiles > 0.2) {
    distScore = Math.max(0, 100 - ((distanceMiles - 0.2) / 4.8) * 100);
  }

  // Crowd level
  let crowdScore = 50;
  if (cafe.current_crowd_level === 'Low') crowdScore = 100;
  else if (cafe.current_crowd_level === 'Moderate') crowdScore = 75;
  else if (cafe.current_crowd_level === 'Busy') crowdScore = 35;
  else if (cafe.current_crowd_level === 'Full') crowdScore = 5;

  // Quietness
  const quietVal = Number(cafe.avg_quietness) || 0;
  const quietScore = quietVal > 0 ? ((quietVal - 1) / 2) * 100 : 50;

  // Aesthetics
  const aesVal = Number(cafe.avg_aesthetics) || 0;
  const aesScore = aesVal > 0 ? ((aesVal - 1) / 4) * 100 : 50;

  // Wifi
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
    reasons,
    excluded: false,
  };
}

function getDistance(lat1, lon1, lat2, lon2) {
  const R = 3958.8; // miles
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
