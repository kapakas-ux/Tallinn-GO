async function test() {
  try {
    const response = await fetch('http://localhost:3000/api/transport/stops');
    console.log('Status:', response.status);
    const text = await response.text();
    console.log('Data length:', text.length);
    console.log('First 200 chars:', text.substring(0, 200));
  } catch (error) {
    console.error('Error:', error.message);
  }
}

test();
