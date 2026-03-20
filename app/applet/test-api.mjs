import axios from 'axios';

async function test() {
  try {
    const response = await axios.get('http://localhost:3000/api/transport/stops');
    console.log('Status:', response.status);
    console.log('Data length:', response.data.length);
    console.log('First 200 chars:', response.data.substring(0, 200));
  } catch (error) {
    console.error('Error:', error.message);
  }
}

test();
