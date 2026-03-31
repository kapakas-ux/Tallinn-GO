const query = `
  {
    vehicles {
      id
      lat
      lon
      heading
      speed
      route {
        shortName
        mode
      }
      trip {
        tripHeadsign
      }
    }
  }
`;

fetch('https://api.peatus.ee/routing/v1/routers/estonia/index/graphql', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ query })
})
.then(res => res.json())
.then(data => console.log(JSON.stringify(data).substring(0, 500)))
.catch(console.error);
