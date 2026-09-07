# ps-reviews-feed

Nightly GitHub Actions job for the Pruden & Smith reviews page. Pulls reviews,
normalises them into one shape, and writes `shop.metafields.reviews.feed` on
Shopify. The theme (`sections/ps-reviews.liquid` on the store) renders from
that metafield - nothing on the storefront talks to Okendo or Google directly.

## What runs

1. **Okendo** - public Storefront API, no key. All pages, `approved` only.
2. **Google score + count** - Places API (New), key only. One call a night.
3. **Google review text** - Business Profile API v4. Runs only once all five
   `GBP_*` secrets exist; until then the page has Google's score but no Google rows.
4. Safety guard: if Okendo returns fewer than 80% of the reviews currently live,
   the job aborts and writes nothing.
5. Builds the feed, skips the write if nothing changed, otherwise writes it.

Trustpilot is not in this job. It has no API on the free plan; its count and
score are theme settings updated by hand.

## Secrets to add (Settings -> Secrets and variables -> Actions)

| Secret | Where from |
|---|---|
| `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET` | Dev Dashboard -> your app -> Settings. The job exchanges these for a 24h token each run (client credentials grant) - there is no long-lived token to copy |
| `GOOGLE_MAPS_API_KEY` | Google Cloud project `reviews-feed-506716` -> APIs -> Places API (New) -> key |
| `GOOGLE_PLACE_ID` | Google's Place ID Finder for the Ditchling gallery |
| `GBP_CLIENT_ID`, `GBP_CLIENT_SECRET` | OAuth client in the same project - **after** GBP approval |
| `GBP_REFRESH_TOKEN` | one-off OAuth authorisation with scope `business.manage` |
| `GBP_ACCOUNT_ID`, `GBP_LOCATION_ID` | from the Business Profile API once approved |

Test first: Actions -> Reviews feed -> Run workflow -> tick **dry_run**. The
built feed is attached to the run as an artifact (`out/feed.json`) either way.

## Feed shape

```json
{
  "updated": "ISO",
  "summary": {
    "total": 758, "average": 4.94,
    "sources": [
      { "key": "onsite", "label": "On our website", "short": "Here", "count": 488, "average": 4.969, "url": null },
      { "key": "google", "label": "On Google", "short": "Google", "count": 270, "average": 4.9, "url": "https://..." }
    ]
  },
  "featured": [ review ],
  "reviews":  [ review ]
}
review = { id, source: "onsite"|"google", rating, title, body, author, date, verified,
           incentivised, product: {handle,title,variant,image,url} | null, reply? }
```

- `featured`: up to 6, body >= 250 chars, 4 stars or better, verified, last 12
  months, one per product, service reviews capped at two. Falls back to 150
  chars if a thin month would leave fewer than three.
- `reviews`: the most recent 200 excluding featured, newest first.
- `average` is weighted by count across sources. Displayed to one decimal by the theme.
- Review text is never edited beyond trimming whitespace.
- Google authors are shortened to "James T." and profile photos dropped.

## Knobs

`FEED_MAX_RECENT` (200) and `FEED_MAX_FEATURED` (6) in the workflow env.
