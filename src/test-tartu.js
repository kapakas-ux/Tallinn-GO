async function test() {
  const res = await fetch('https://api.digitransit.fi/routing/v1/routers/tartu/index/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'digitransit-subscription-key': 'YOUR_API_KEY' // Wait, does it need an API key?
    },
    body: JSON.stringify({
      query: `{
        vehicles {
          id
          lat
          lon
          route {
            shortName
          }
        }
      }`
    })
  });
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}
test();
