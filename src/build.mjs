// Turns the normalised review list + summaries into the feed the theme renders.
// Shape is documented in README.md and consumed by sections/ps-reviews.liquid.

const DAY = 86400000;

export function pickFeatured(reviews, max) {
  const cutoff = Date.now() - 365 * DAY;
  const fresh = reviews.filter(r => new Date(r.date).getTime() >= cutoff && r.rating >= 4 && r.body);
  const choose = (minLen) => {
    const seen = new Set();
    let services = 0;
    return fresh
      .filter(r => r.body.length >= minLen && (r.source !== 'onsite' || r.verified))
      .sort((a, b) => b.body.length - a.body.length)
      .filter(r => {
        // one per product so the top of the page isn't four bangles in a row;
        // service reviews (no product) capped at two
        if (r.product) { if (seen.has(r.product.handle)) return false; seen.add(r.product.handle); return true; }
        return services++ < 2;
      })
      .slice(0, max);
  };
  let out = choose(250);
  if (out.length < 3) out = choose(150);   // thin month? relax rather than show an empty block
  return out;
}

// Okendo occasionally holds the same review twice (customer hit submit twice):
// same text, different IDs, sometimes a slightly different name ("Joanne" /
// "Joanne P."). Long text is unique enough on its own; short text ("Love it")
// needs the name too. Keep the first (newest) of each.
export function dedupe(reviews) {
  const seen = new Set();
  const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  return reviews.filter(r => {
    const body = norm(r.body);
    const key = body.length >= 60 ? `${r.source}|${body}` : `${r.source}|${norm(r.author)}|${body}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function buildFeed({ onsite, google, placesSummary, googleReviewsUrl, maxRecent, maxFeatured }) {
  onsite = dedupe(onsite);
  google = dedupe(google);
  const all = [...onsite, ...google].filter(r => r.body && r.rating > 0);
  all.sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0));

  const featured = pickFeatured(all, maxFeatured);
  const featuredIds = new Set(featured.map(r => r.id));
  const recent = all.filter(r => !featuredIds.has(r.id)).slice(0, maxRecent);

  const avg = (list) => list.length ? +(list.reduce((s, r) => s + r.rating, 0) / list.length).toFixed(3) : 0;

  const sources = [
    { key: 'onsite', label: 'On our website', short: 'Here', count: onsite.length, average: avg(onsite), url: null },
  ];
  // Google's count/average come from Places (public, always available); the
  // review text only once GBP is approved. Both are the same "google" source.
  if (placesSummary && placesSummary.count > 0) {
    sources.push({ key: 'google', label: 'On Google', short: 'Google', count: placesSummary.count, average: placesSummary.average, url: googleReviewsUrl });
  }

  // Weighted overall (NOT the mean of the averages - Okendo's 488 would be
  // flattened against Google's 270 otherwise). Trustpilot is manual in the
  // theme and deliberately not part of this figure.
  const totalCount = sources.reduce((s, x) => s + x.count, 0);
  const weighted = totalCount ? +(sources.reduce((s, x) => s + x.average * x.count, 0) / totalCount).toFixed(3) : 0;

  return {
    updated: new Date().toISOString(),
    summary: { total: totalCount, average: weighted, sources },
    featured,
    reviews: recent,
  };
}
