import axios from 'axios';

async function test() {
  try {
    const response = await axios.get('https://transport.tallinn.ee/data/stops.txt', {
      responseType: 'text',
      timeout: 10000
    });
    const text = response.data;
    const lines = text.split(/\r\n|\r|\n/).filter(l => l.trim().length > 0);
    console.log('Total lines:', lines.length);
    
    let validCount = 0;
    let shortCount = 0;
    let nanCount = 0;
    let outOfRangeCount = 0;
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith('#')) continue;
      
      const parts = line.split(';');
      if (parts.length < 6) {
        shortCount++;
        continue;
      }
      
      const id = parts[0];
      const latRaw = parseInt(parts[2], 10);
      const lngRaw = parseInt(parts[3], 10);
      const name = parts[5];
      
      if (isNaN(latRaw) || isNaN(lngRaw)) {
        nanCount++;
        continue;
      }
      
      const lat = latRaw / 100000;
      const lng = lngRaw / 100000;
      
      if (lat < 57 || lat > 60 || lng < 21 || lng > 29) {
        outOfRangeCount++;
        continue;
      }
      
      validCount++;
    }
    
    console.log('Valid stops:', validCount);
    console.log('Short lines (< 6 parts):', shortCount);
    console.log('NaN coordinates:', nanCount);
    console.log('Out of range coordinates:', outOfRangeCount);
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

test();
