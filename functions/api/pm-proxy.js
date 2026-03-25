export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const targetUrl = url.searchParams.get('url');

  if (!targetUrl) {
    return new Response(JSON.stringify({ error: "Missing url parameter" }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Validate we only proxy exactly what we need (Polymarket APIs)
  if (!targetUrl.startsWith('https://data-api.polymarket.com') && !targetUrl.startsWith('https://gamma-api.polymarket.com')) {
    return new Response(JSON.stringify({ error: "Invalid target URL" }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const targetResponse = await fetch(targetUrl, {
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'User-Agent': 'Cloudflare-Worker'
      }
    });

    // Copy the response, but inject our own permissive CORS headers
    const newHeaders = new Headers(targetResponse.headers);
    newHeaders.set('Access-Control-Allow-Origin', '*');
    newHeaders.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    newHeaders.set('Access-Control-Allow-Headers', 'Content-Type');

    // Remove any tight restrictions Polymarket data APIs send back
    newHeaders.delete('X-Frame-Options');

    return new Response(targetResponse.body, {
      status: targetResponse.status,
      statusText: targetResponse.statusText,
      headers: newHeaders
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}
