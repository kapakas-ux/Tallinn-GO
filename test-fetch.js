import axios from 'axios';
axios.get('https://transport.tallinn.ee/data/stops.txt').then(res => {
  console.log("Status:", res.status);
  console.log("Data length:", res.data.length);
  console.log("First 200 chars:", res.data.substring(0, 200));
}).catch(err => {
  console.error("Error:", err.message);
});