// Fetch page HTML and JS to find WebSocket logic
const resp = await fetch('https://www.tartulinnaliin.ee/livemap');
const html = await resp.text();

// Find script tags
const scriptMatches = [...html.matchAll(/<script[^>]*src="([^"]+)"[^>]*>/g)];
console.log('Scripts:');
scriptMatches.forEach(m => console.log(' ', m[1]));

// Also find inline scripts mentioning websocket
const inlineMatches = [...html.matchAll(/websocket|ws:\/\/|wss:\/\/|vehicle-status|ridango/gi)];
console.log('\nWebSocket mentions in HTML:', inlineMatches.length);

// Fetch the main JS bundle
const jsUrls = scriptMatches.map(m => m[1]).filter(u => !u.includes('leaflet') && !u.includes('analytics'));
for (const jsUrl of jsUrls) {
  const fullUrl = jsUrl.startsWith('http') ? jsUrl : `https://www.tartulinnaliin.ee${jsUrl}`;
  console.log(`\nFetching: ${fullUrl}`);
  try {
    const jsResp = await fetch(fullUrl);
    const jsText = await jsResp.text();
    console.log(`Size: ${jsText.length}`);
    
    // Find WebSocket-related code
    const wsIdx = jsText.search(/vehicle-status|rt-ws|ridango\.com|WebSocket|new\s+WebSocket/i);
    if (wsIdx >= 0) {
      console.log('Found WS code at index', wsIdx);
      // Print surrounding context
      const start = Math.max(0, wsIdx - 200);
      const end = Math.min(jsText.length, wsIdx + 800);
      console.log(jsText.substring(start, end));
    }
    
    // Also search for subscribe/send patterns
    const sendIdx = jsText.search(/\.send\(|subscribe|onopen/i);
    if (sendIdx >= 0) {
      console.log('\n\nFound send/subscribe at index', sendIdx);
      const start2 = Math.max(0, sendIdx - 200);
      const end2 = Math.min(jsText.length, sendIdx + 500);
      console.log(jsText.substring(start2, end2));
    }
  } catch (e) {
    console.log('Error:', e.message);
  }
}
