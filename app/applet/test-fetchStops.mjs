import axios from 'axios';

async function test() {
  const response = await axios.get('http://localhost:3000/api/transport/stops');
  const text = response.data;
  const cleanText = text.replace(/^\uFEFF/, '').trim();
  const lines = cleanText.split(/\r\n|\r|\n/).filter(l => l.trim().length > 0);
  console.log(`fetchStops: found ${lines.length} lines`);

  const stops = [];
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('#')) continue;
    
    const parts = line.split(';');
    if (parts.length < 6) continue;
    
    const id = parts[0];
    const latRaw = parseInt(parts[2], 10);
    const lngRaw = parseInt(parts[3], 10);
    const name = parts[5];
    
    if (isNaN(latRaw) || isNaN(lngRaw)) continue;
    
    const lat = latRaw / 100000;
    const lng = lngRaw / 100000;
    
    if (lat < 57 || lat > 60 || lng < 21 || lng > 29) continue;
    
    stops.push({
      id: id,
      name: name,
      lat: lat,
      lng: lng
    });
  }
  console.log(`Successfully parsed ${stops.length} stops`);
}
test();