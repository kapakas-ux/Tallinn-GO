import axios from 'axios';

async function test() {
  try {
    const response = await axios.get('https://transport.tallinn.ee/data/stops.txt', {
      responseType: 'text',
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://transport.tallinn.ee/'
      }
    });
    console.log('Status:', response.status);
    console.log('Data length:', response.data.length);
  } catch (error) {
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    }
  }
}

test();
