import axios from 'axios';
async function test() {
  // Try a stop that likely has departures, like Viru (10501-1 in mock, but let's find real ID)
  // From my previous grep, Keskväljak was a21822-1.
  const stopId = '1280'; 
  const response = await axios.get(`https://transport.tallinn.ee/siri-stop-departures.php?stopid=${stopId}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': 'https://transport.tallinn.ee/'
    }
  });
  console.log('Full response:');
  console.log(response.data);
  
  const lines = response.data.split('\n');
  console.log('Line count:', lines.length);
  lines.forEach((line, i) => {
    console.log(`Line ${i}: ${line}`);
  });
}
test();