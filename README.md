# follow-amazon-daily

Daily Amazon seller intelligence digest for Codex.

It combines the low-friction feed aggregation pattern from `follow-builders` with the structured, auditable workflow style from `wayamzpost`. The result is a small public skill that can run on GitHub Actions and produce a Chinese-first bilingual seller digest.

## What It Produces

- `data/feed-amazon.json`: structured public feed
- `digest/YYYY-MM-DD.md`: daily public digest
- stdout: digest plus optional private authenticated signals

No auto-publishing is included in V1.

## Quick Start

```bash
npm test
node scripts/audit-sources.js --dry-run
node scripts/prepare-digest.js
```

## Sources

Default public sources include:

- Amazon SP-API docs
- Amazon Ads Library
- Buy with Prime blog
- Walmart Marketplace release notes
- Helium 10 blog
- Serious Sellers Podcast RSS: `https://feed.podbean.com/helium10/feed.xml`
- AMZ123
- WeAreSellers RSS: `https://www.wearesellers.com/feed`
- Billion Dollar Sellers archive: `https://www.billiondollarsellers.com/archive`
- MyAmazonGuy YouTube RSS: `https://www.youtube.com/feeds/videos.xml?channel_id=UClUSEsDS2sdgNJfCcCM_5Uw`

## Optional Auth

WeAreSellers and Billion Dollar Sellers can be enhanced with authenticated cookies:

```bash
export WEARESELLERS_COOKIE='name=value; other=value'
export BDS_COOKIE='name=value; other=value'
node scripts/prepare-digest.js
```

The script never stores raw authenticated page text. Private authenticated insights are stdout-only by default. If you intentionally want a local private file, use:

```bash
node scripts/prepare-digest.js --include-private-digest
```

`digest/private-*.md` is ignored by git.

## GitHub Actions

The workflow runs daily at `14:30 UTC`, tests the parser, audits sources in non-fatal dry-run mode, and commits `data/feed-amazon.json` plus the public digest when there are changes.

GitHub Actions does not pass auth secrets by default. Keep private cookies out of public workflow logs unless you deliberately build a private workflow.

## Schema

Every feed item includes:

- `id`
- `source`
- `sourceType`
- `category`
- `title`
- `url`
- `publishedAt`
- `excerpt`
- `sellerImpact`
- `tags`
- `access`
- `sourceReliability`

See `config/schema.json`.

## License

MIT
