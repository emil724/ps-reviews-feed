// Dev Dashboard apps authenticate with the CLIENT CREDENTIALS GRANT: exchange the
// app's Client ID + Client secret for a 24-hour access token on every run. There is
// no long-lived shpat_ token to copy - admin-created custom apps were closed by
// Shopify, so this is the only route for a new app.
let cachedToken = null;

export async function getToken({ store, clientId, clientSecret }) {
  if (cachedToken) return cachedToken;
  const res = await fetch(`https://${store}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, grant_type: 'client_credentials' }),
  });
  if (!res.ok) throw new Error(`Shopify token ${res.status}: ${await res.text()}`);
  const d = await res.json();
  if (!d.access_token) throw new Error(`Shopify token: no access_token in response`);
  cachedToken = d.access_token;
  return cachedToken;
}

const gql = async (cfg, query, variables) => {
  const token = await getToken(cfg);
  const res = await fetch(`https://${cfg.store}/admin/api/${cfg.version}/graphql.json`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-Shopify-Access-Token': token },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Shopify ${res.status}: ${await res.text()}`);
  const d = await res.json();
  if (d.errors) throw new Error(`Shopify GraphQL: ${JSON.stringify(d.errors)}`);
  return d.data;
};

export async function readFeed(cfg) {
  const d = await gql(cfg, `query { shop { metafield(namespace: "reviews", key: "feed") { value } } }`);
  const v = d.shop && d.shop.metafield && d.shop.metafield.value;
  return v ? JSON.parse(v) : null;
}

export async function writeFeed(cfg, feed) {
  const d = await gql(cfg, `
    mutation Set($m: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $m) { metafields { updatedAt } userErrors { field message code } }
    }`,
    { m: [{ ownerId: cfg.shopGid, namespace: 'reviews', key: 'feed', type: 'json', value: JSON.stringify(feed) }] });
  const errs = d.metafieldsSet.userErrors;
  if (errs && errs.length) throw new Error(`metafieldsSet: ${JSON.stringify(errs)}`);
  return d.metafieldsSet.metafields[0].updatedAt;
}
