import axios from 'axios';
async function test() {
  const stopId = '1290'; 
  try {
    const response = await axios.get(`https://transport.tallinn.ee/siri-stop-departures.php?stopid=${stopId}`, {
      timeout: 5000
    });
    console.log('Full response:');
    console.log(response.data);
    
    const lines = response.data.split('\n');
    console.log('Line count:', lines.length);
    lines.forEach((line, i) => {
      console.log(`Line ${i}: ${line}`);
    });
  } catch (error) {
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}
test();
