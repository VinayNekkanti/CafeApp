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

    // 3. Connect to OpenAI to extract structured preferences
    const openAiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openAiApiKey) {
      throw new Error('OPENAI_API_KEY is not configured on the server.');
    }

    // Call OpenAI for structured preference extraction
    const model = 'gpt-4o-mini';
    const openaiUrl = 'https://api.openai.com/v1/chat/completions';

    const systemPrompt = `You are a helper that extracts structured preferences from a student's natural language request for a study spot cafe near UC Irvine.
Extract the preferences matching this schema:
{
  "max_distance": number (optional, max distance in miles or minutes),
  "distance_unit": "miles" | "minutes" (optional),
  "wifi_required": boolean (optional),
  "preferred_crowd_levels": Array of "Low" | "Moderate" | "Busy" | "Full" (optional),
  "quietness": "Quiet" | "Moderate" | "Loud" (optional),
  "aesthetics_priority": "Low" | "Medium" | "High" (optional)
}`;

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
          { role: 'user', content: `Extract preferences from: "${query}"` },
        ],
      }),
    });

    const extractResult = await extractResponse.json();
    const extractedText = extractResult.choices[0].message.content;
    const preferences = JSON.parse(extractedText);

    // 4. Run Deterministic Scoring
    // We implement the scoring here in Javascript matching our client code
    const scoredCafes = cafes.map((cafe) => {
      const cafeHours = hoursMap[cafe.id] || [];
      const scoreResult = calculateScoreLocally(cafe, cafeHours, userLat, userLon, preferences);
      return {
        cafe,
        score: scoreResult.score,
        reasons: scoreResult.reasons,
        excluded: scoreResult.excluded,
      };
    }).filter((c) => !c.excluded);

    // Sort by score descending and take top 3
    const topCafes = scoredCafes
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((c) => c.cafe);

    // 5. Ask OpenAI to write a grounded natural language explanation
    const explainPrompt = `You are the Café Study Spot AI Assistant for UC Irvine students.
Given the user's request, the extracted preferences, and the top matched cafés, explain why these cafés are recommended.
Strictly adhere to the following rules:
1. ONLY use the provided café facts. Do not invent any coordinates, hours, Wi-Fi speeds, names, or features.
2. If Wi-Fi is unavailable or crowd status is not reported, state that.
3. Be concise, student-friendly, and helpful. Mention the distance and why it fits.

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
    const explanation = explainResult.choices[0].message.content;

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
