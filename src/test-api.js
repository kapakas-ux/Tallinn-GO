async function run() {
  const query = `
    {
      __type(name: "Stop") {
        fields {
          name
        }
      }
    }
  `;
  const response = await fetch('https://api.peatus.ee/routing/v1/routers/estonia/index/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query })
  });
  const data = await response.json();
  console.log(data.data.__type.fields.map(f => f.name));
}

run();
