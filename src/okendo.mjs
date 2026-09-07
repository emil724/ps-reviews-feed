// Okendo Storefront REST API - public, no key. Walks nextUrl until exhausted.
const BASE = 'https://api.okendo.io';

export async function fetchOkendo(subscriberId) {
  let url = `/v1/stores/${subscriberId}/reviews?limit=100`;
  const out = [];
  let pages = 0;
  while (url && pages < 20) {
    const res = await fetch(BASE + url, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`Okendo ${res.status} on page ${pages + 1}`);
    const data = await res.json();
    out.push(...(data.reviews || []));
    url = data.nextUrl ? (data.nextUrl.startsWith('/v1') ? data.nextUrl : '/v1' + data.nextUrl) : null;
    pages++;
  }
  return out;
}

// Normalise one Okendo review into the feed shape. Review text is never edited -
// trailing whitespace trimmed, nothing else.
export function normaliseOkendo(r) {
  const site = 'https://www.prudenandsmith.com';
  const product = r.productHandle
    ? {
        handle: r.productHandle,
        title: r.productName || '',
        variant: r.productVariantName || '',
        image: r.productImageUrl || '',
        url: r.productUrl ? (r.productUrl.startsWith('//') ? 'https:' + r.productUrl : r.productUrl) : `${site}/products/${r.productHandle}`,
      }
    : null;
  return {
    id: `onsite:${r.reviewId}`,
    source: 'onsite',
    rating: Number(r.rating) || 0,
    title: (r.title || '').trim(),
    body: (r.body || '').trim(),
    author: (r.reviewer && r.reviewer.displayName) ? r.reviewer.displayName.trim() : 'Customer',
    date: (r.dateCreated || '').slice(0, 10),
    verified: !!(r.reviewer && r.reviewer.isVerified),
    incentivised: !!r.isIncentivized,
    product,
  };
}
