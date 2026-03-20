const axios = require('axios');

async function test() {
  try {
    const response = await axios.get('https://transport.tallinn.ee/data/stops.txt', {
      responseType: 'arraybuffer',
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/plain, */*',
        'Cache-Control': 'no-cache'
      },
      validateStatus: (status) => status === 200,
      maxRedirects: 5
    });
    console.log('Status:', response.status);
    console.log('Data length:', response.data.length);
    console.log('First 200 chars:', Buffer.from(response.data).toString('utf-8').substring(0, 200));
  } catch (error) {
    console.error('Error:', error.message);
  }
}

test();
