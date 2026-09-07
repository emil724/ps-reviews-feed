// ---------- Score + count: Places API (New). Key only, no approval. ----------
// rating/userRatingCount sit on the Enterprise SKU; one call a day is inside the
// free monthly allowance and pennies beyond it. NEVER call this per page view.
export async function fetchPlacesSummary({ apiKey, placeId }) {
  if (!apiKey || !placeId) return null;
  const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
    headers: { 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': 'rating,userRatingCount' },
  });
  if (!res.ok) throw new Error(`Places API ${res.status}: ${await res.text()}`);
  const d = await res.json();
  return { count: Number(d.userRatingCount) || 0, average: Number(d.rating) || 0 };
}

// ---------- Review TEXT: Business Profile API v4. Gated on GBP approval. ----------
// Only runs when all five GBP_* secrets are present. Until then this returns []
// and the page simply has no Google rows - the score still comes from Places.
const STAR = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };

async function accessToken({ clientId, clientSecret, refreshToken }) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' }),
  });
  if (!res.ok) throw new Error(`GBP token ${res.status}: ${await res.text()}`);
  return (await res.json()).access_token;
}

export async function fetchGbpReviews(cfg) {
  const { clientId, clientSecret, refreshToken, accountId, locationId } = cfg;
  if (!clientId || !clientSecret || !refreshToken || !accountId || !locationId) return [];
  const token = await accessToken(cfg);
  const out = [];
  let pageToken = '';
  for (let i = 0; i < 20; i++) {
    const u = new URL(`https://mybusiness.googleapis.com/v4/accounts/${accountId}/locations/${locationId}/reviews`);
    u.searchParams.set('pageSize', '50');
    if (pageToken) u.searchParams.set('pageToken', pageToken);
    const res = await fetch(u, { headers: { authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`GBP reviews ${res.status}: ${await res.text()}`);
    const d = await res.json();
    out.push(...(d.reviews || []));
    pageToken = d.nextPageToken || '';
    if (!pageToken) break;
  }
  return out;
}

// Google gives full names and profile photos. Shorten to "James T." to match
// Okendo's format and drop the photo - consistency, and it sidesteps the
// attribution rules that come with displaying Google profile imagery.
export function normaliseGbp(r) {
  const full = (r.reviewer && r.reviewer.displayName) || 'Google user';
  const parts = full.trim().split(/\s+/);
  const author = parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0];
  return {
    id: `google:${r.reviewId || r.name}`,
    source: 'google',
    rating: STAR[r.starRating] || 0,
    title: '',
    body: (r.comment || '').trim(),
    author,
    date: (r.createTime || '').slice(0, 10),
    verified: false,          // Google has no purchase verification; label is "Google review"
    incentivised: false,
    product: null,
    reply: r.reviewReply && r.reviewReply.comment ? { body: r.reviewReply.comment.trim(), date: (r.reviewReply.updateTime || '').slice(0, 10) } : null,
  };
}
