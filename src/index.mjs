import { mkdir, writeFile } from 'node:fs/promises';
import { fetchOkendo, normaliseOkendo } from './okendo.mjs';
import { fetchPlacesSummary, fetchGbpReviews, normaliseGbp } from './google.mjs';
import { readFeed, writeFeed } from './shopify.mjs';
import { buildFeed } from './build.mjs';

const env = (k, d = '') => (process.env[k] ?? d).trim();
const DRY = !!env('DRY_RUN');
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

const shopify = { store: env('SHOPIFY_STORE'), clientId: env('SHOPIFY_CLIENT_ID'), clientSecret: env('SHOPIFY_CLIENT_SECRET'), version: env('SHOPIFY_API_VERSION', '2026-07'), shopGid: env('SHOPIFY_SHOP_GID') };

async function main() {
  // ---- 1. Okendo (required) ----
  const raw = await fetchOkendo(env('OKENDO_SUBSCRIBER_ID'));
  const onsite = raw.filter(r => r.status === 'approved').map(normaliseOkendo).filter(r => r.body);
  log(`Okendo: ${raw.length} fetched, ${onsite.length} approved with text`);

  // ---- 2. Google score/count (Places) - optional, key only ----
  let places = null;
  try {
    places = await fetchPlacesSummary({ apiKey: env('GOOGLE_MAPS_API_KEY'), placeId: env('GOOGLE_PLACE_ID') });
    log(places ? `Places: ${places.count} reviews, ${places.average} average` : 'Places: skipped (no key/place id)');
  } catch (e) {
    log(`Places: FAILED (${e.message}) - keeping last known Google summary`);
  }

  // ---- 3. Google review text (GBP) - optional, runs only once approved ----
  let google = [];
  try {
    const g = await fetchGbpReviews({ clientId: env('GBP_CLIENT_ID'), clientSecret: env('GBP_CLIENT_SECRET'), refreshToken: env('GBP_REFRESH_TOKEN'), accountId: env('GBP_ACCOUNT_ID'), locationId: env('GBP_LOCATION_ID') });
    google = g.map(normaliseGbp).filter(r => r.body);
    log(g.length ? `GBP: ${g.length} reviews, ${google.length} with text` : 'GBP: skipped (not approved / no credentials yet)');
  } catch (e) {
    log(`GBP: FAILED (${e.message}) - continuing without Google review text`);
  }

  // ---- 4. What's live now (for the safety guard and no-op detection) ----
  const previous = DRY ? null : await readFeed(shopify).catch(e => { log(`read previous feed failed: ${e.message}`); return null; });
  const prevOnsite = previous?.summary?.sources?.find(s => s.key === 'onsite')?.count || 0;
  const prevGoogle = previous?.summary?.sources?.find(s => s.key === 'google');

  // ---- 5. SAFETY GUARD: never replace a good feed with a suspiciously small one ----
  if (prevOnsite && onsite.length < prevOnsite * 0.8) {
    throw new Error(`ABORT: Okendo returned ${onsite.length} reviews but the live feed has ${prevOnsite}. Refusing to write.`);
  }

  // ---- 6. Build ----
  const feed = buildFeed({
    onsite, google,
    placesSummary: places || (prevGoogle ? { count: prevGoogle.count, average: prevGoogle.average } : null),
    googleReviewsUrl: env('GOOGLE_REVIEWS_URL'),
    maxRecent: Number(env('FEED_MAX_RECENT', '200')),
    maxFeatured: Number(env('FEED_MAX_FEATURED', '6')),
  });
  await mkdir('out', { recursive: true });
  await writeFile('out/feed.json', JSON.stringify(feed, null, 2));
  log(`Built: ${feed.summary.total} total, ${feed.summary.average} weighted, ${feed.featured.length} featured, ${feed.reviews.length} recent, ${JSON.stringify(feed).length} bytes`);
  log('Featured:', feed.featured.map(r => `${r.author} (${r.body.length} chars${r.product ? ', ' + r.product.handle : ', service'})`).join(' | '));

  if (DRY) { log('DRY RUN - not writing.'); return; }

  // ---- 7. Skip the write if nothing changed (ignore the timestamp) ----
  const strip = (f) => f && JSON.stringify({ ...f, updated: undefined });
  if (previous && strip(previous) === strip(feed)) { log('No change since last run - not writing.'); return; }

  // ---- 8. Write ----
  const at = await writeFeed(shopify, feed);
  log(`Wrote shop.metafields.reviews.feed at ${at}`);
  if (previous) {
    const added = feed.reviews.filter(r => !previous.reviews?.some(p => p.id === r.id)).length;
    log(`New reviews since last run: ${added}`);
  }
}

main().catch(e => { console.error(e.stack || e.message); process.exit(1); });
