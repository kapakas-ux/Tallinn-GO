const axios = require('axios');

async function checkSize() {
  const query = '{ stops { gtfsId name lat lon code desc zoneId parentStation { name } routes { mode } } }';
  const response = await axios.post("https://api.peatus.ee/routing/v1/routers/estonia/index/graphql", { query }, {
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    }
  });
  const data = JSON.stringify(response.data);
  console.log(`Size: ${(data.length / 1024 / 1024).toFixed(2)} MB`);
}

checkSize();
