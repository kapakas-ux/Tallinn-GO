import axios from 'axios';

async function test() {
  try {
    const response = await axios.get('https://transport.tallinn.ee/data/stops.txt', {
      responseType: 'text',
      timeout: 10000
    });
    const text = response.data;
    const lines = text.split(/\r\n|\r|\n/).filter(l => l.trim().length > 0);
    
    let withSiriId = 0;
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].trim().split(';');
      if (parts.length >= 6 && parts[1]) {
        withSiriId++;
        if (withSiriId <= 5) {
          console.log('Stop with SiriID:', parts[0], parts[1], parts[5]);
        }
      }
    }
    console.log('Total stops with SiriID:', withSiriId);
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

test();
