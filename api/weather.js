/* ============================================================
   /api/weather — Vercel Serverless Function
   --------------------------------------------------------------
   Proxies weather lookups through the server so the browser never
   calls Open-Meteo directly. This avoids browser-side CORS/sandbox
   restrictions entirely (the kind that block fetch() calls from
   file:// pages or iframe preview sandboxes like Claude's Artifact
   viewer) — server-to-server requests have no such restriction.

   Usage: GET /api/weather?destination=東京

   Response (success):
     { "ok": true, "destination": "東京", "resolvedName": "東京",
       "temperature": 18, "code": 3 }

   Response (failure):
     { "ok": false, "error": "destination_not_found" | "upstream_error" | "missing_destination",
       "message": "<human readable detail>" }
   ============================================================ */

// Country name -> capital/major city fallback, same logic as the
// front-end previously had, now centralized here so it only needs
// to be correct in one place.
const COUNTRY_TO_CITY_FALLBACK = {
  '越南': '胡志明市', 'vietnam': 'Ho Chi Minh City',
  '泰國': '曼谷', 'thailand': 'Bangkok',
  '日本': '東京', 'japan': 'Tokyo',
  '韓國': '首爾', 'south korea': 'Seoul', 'korea': 'Seoul',
  '中國': '上海', 'china': 'Shanghai',
  '美國': '紐約', 'usa': 'New York', 'united states': 'New York',
  '英國': '倫敦', 'uk': 'London', 'united kingdom': 'London',
  '法國': '巴黎', 'france': 'Paris',
  '義大利': '羅馬', 'italy': 'Rome',
  '澳洲': '雪梨', 'australia': 'Sydney',
  '新加坡': '新加坡', 'singapore': 'Singapore',
  '馬來西亞': '吉隆坡', 'malaysia': 'Kuala Lumpur',
  '印尼': '雅加達', 'indonesia': 'Jakarta',
  '菲律賓': '馬尼拉', 'philippines': 'Manila'
};

function resolveDestinationName(name) {
  const trimmed = name.trim();
  const lower = trimmed.toLowerCase();
  return COUNTRY_TO_CITY_FALLBACK[trimmed] || COUNTRY_TO_CITY_FALLBACK[lower] || trimmed;
}

async function geocode(name) {
  const tryFetch = async (url) => {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    return (data.results && data.results.length > 0) ? data.results[0] : null;
  };

  const base = 'https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(name) + '&count=1';
  let result = await tryFetch(base + '&language=zh');
  if (!result) result = await tryFetch(base);
  return result; // null if not found
}

async function fetchWeather(lat, lon) {
  const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lon + '&current=temperature_2m,weather_code';
  const res = await fetch(url);
  if (!res.ok) throw new Error('upstream_forecast_http_' + res.status);
  const data = await res.json();
  if (!data.current) throw new Error('upstream_forecast_missing_current');
  return {
    temperature: Math.round(data.current.temperature_2m),
    code: data.current.weather_code
  };
}

export default async function handler(req, res) {
  // Allow this endpoint to be called from any origin running the front-end.
  // Tighten this to your actual deployed domain once you have one, e.g.
  // res.setHeader('Access-Control-Allow-Origin', 'https://your-app.vercel.app');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'method_not_allowed', message: 'Use GET.' });
    return;
  }

  const destination = (req.query.destination || '').toString().trim();
  if (!destination) {
    res.status(400).json({ ok: false, error: 'missing_destination', message: 'Query param "destination" is required.' });
    return;
  }

  const resolvedName = resolveDestinationName(destination);

  try {
    const place = await geocode(resolvedName);
    if (!place) {
      res.status(404).json({
        ok: false,
        error: 'destination_not_found',
        message: 'No geocoding match for "' + resolvedName + '" (from input "' + destination + '").'
      });
      return;
    }

    const weather = await fetchWeather(place.latitude, place.longitude);

    // Cache at the edge/CDN for 10 minutes — current weather doesn't need
    // to be re-fetched from Open-Meteo on every single page view.
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1800');
    res.status(200).json({
      ok: true,
      destination: destination,
      resolvedName: resolvedName,
      latitude: place.latitude,
      longitude: place.longitude,
      temperature: weather.temperature,
      code: weather.code
    });
  } catch (err) {
    console.error('[api/weather] upstream failure for destination "' + destination + '":', err);
    res.status(502).json({
      ok: false,
      error: 'upstream_error',
      message: err.message || 'Unknown upstream error while contacting Open-Meteo.'
    });
  }
}
