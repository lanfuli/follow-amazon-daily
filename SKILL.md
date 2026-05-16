---
name: follow-amazon-daily
description: Generate a daily bilingual Amazon-seller intelligence digest from public official, industry, community, podcast, newsletter, and YouTube sources. Use when the user asks for Amazon seller daily news, Amazon marketplace intelligence, WeAreSellers/BDS/MyAmazonGuy/Serious Sellers monitoring, or a concise action-oriented seller digest. Outputs Markdown/stdout and a structured feed; never auto-publishes.
version: 0.1.0
---

# follow-amazon-daily

Generate a daily Amazon seller intelligence digest. Default language is Chinese.

## Hard Rules

1. Public sources are the default. Authenticated WeAreSellers and Billion Dollar Sellers content is optional and only enabled when `WEARESELLERS_COOKIE` or `BDS_COOKIE` is present.
2. Never ask for or store account passwords. Only use cookie/session env vars or a local logged-in browser workflow added by the user later.
3. Authenticated full text is ephemeral. Use it to derive short insights only; do not write raw HTML, raw article text, or full subscriber/community posts to `data/feed-amazon.json`.
4. WeAreSellers is a community pain-signal source, not policy authority. Confirm policy claims with official sources.
5. Billion Dollar Sellers is industry opinion unless confirmed elsewhere.
6. This skill does not publish to Telegram, email, Notion, Xiaohongshu, LinkedIn, X, or Instagram.
7. Follow `config.language` exactly: `zh` means translate English source content into Chinese; `en` means English; `bilingual` means interleaved English and Chinese. See [prompts/translate.md](prompts/translate.md).

## Outputs

```
data/feed-amazon.json       # public structured feed
digest/YYYY-MM-DD.md        # public daily digest
stdout                      # same digest plus optional private auth signals
```

Private digest files are only written when `--include-private-digest` is passed, and they are ignored by git as `digest/private-*.md`.

## Daily Workflow

From the repo root:

```bash
node scripts/prepare-digest.js
```

Useful options:

```bash
node scripts/prepare-digest.js --date 2026-05-16
node scripts/prepare-digest.js --language zh
node scripts/prepare-digest.js --language en
node scripts/prepare-digest.js --public-only
node scripts/prepare-digest.js --quiet
node scripts/prepare-digest.js --dry-run
node scripts/audit-sources.js --dry-run
```

## Source Policy

- Official / Policy: Amazon and Walmart pages override community or media claims.
- Seller Ops: industry sources can suggest experiments, not policy conclusions.
- Community Pain Signals: use WeAreSellers to spot repeated pain, confusion, account-risk patterns, or operational friction.
- Podcast / Video Playbooks: use Serious Sellers Podcast and MyAmazonGuy for tactics.
- Newsletter / Analyst Signals: use BDS for strategic opinions and trend hypotheses.

## Language Policy

`config/sources.json` has `language: "zh"` by default. When `language` is `zh`, do not leave English RSS excerpts as the digest body. Translate titles, summaries, seller impact, and suggested actions into natural Chinese while preserving operator terms such as Amazon, PPC, ASIN, Sponsored Products, Brand Registry, and Search Query Performance.

This follows the same intent as `follow-builders`: the feed can be English, but the final digest language must match the user's selection.

## Authenticated Sources

Optional env vars:

```bash
export WEARESELLERS_COOKIE='name=value; other=value'
export BDS_COOKIE='name=value; other=value'
```

When present, the script attempts authenticated page fetches for the top public links from those sources. The fetched page text is trimmed into short derived insights in memory. The public feed and public digest still exclude raw authenticated content.

## Before Trusting a Digest

Run:

```bash
npm test
node scripts/audit-sources.js --dry-run
```

If a source is flagged, treat the digest as partial and check `errors` in `data/feed-amazon.json`.
