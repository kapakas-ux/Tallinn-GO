const fetch = require('node-fetch');

async function test() {
  const query = `{
    vehicles {
      id
      lat
      lon
    }
  }`;
  
  const res = await fetch('https://api.digitransit.fi/routing/v1/routers/finland/index/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'digitransit-subscription-key': 'c7143fd8a1d841dd89a40bf8072ff73d'
    },
    body: JSON.stringify({ query })
  });
  
  const text = await res.text();
  console.log("finland graphql:", text.substring(0, 200));
}

test();
