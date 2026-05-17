**English** | [中文](README.zh-CN.md)

# follow-amazon-daily

Daily Amazon seller intelligence digest skill.

It combines the low-friction feed aggregation pattern from `follow-builders`
with the structured, auditable workflow style from `wayamzpost`. A deterministic
script fetches raw content; the agent remixes it into a real editorial digest in
Chinese, English, or bilingual mode. Nothing is auto-published to social
platforms.

## Architecture (two stages)

1. **`scripts/prepare-digest.js`** — fetches every source, writes the
   deterministic raw feed `data/feed-amazon.json`, and prints a single JSON blob
   (raw items + prompts + config + stats) to stdout. It does **not** write the
   digest and does **not** translate.
2. **The agent** — reads that JSON and remixes it into `digest/YYYY-MM-DD.md`
   following `prompts/daily-digest.md` and `prompts/translate.md`. Every item
   gets its own specific summary written from the raw `body`/`excerpt` — there is
   no hardcoded phrase dictionary, so the output is not repetitive boilerplate.

## What It Produces

- `data/feed-amazon.json`: deterministic raw public feed (script-written)
- `digest/YYYY-MM-DD.md`: editorial digest (agent-written, never includes
  private authenticated content)
- stdout: full JSON blob for the agent, plus optional stdout-only private
  authenticated signals

## Quick Start

```bash
npm test
node scripts/audit-sources.js --dry-run
node scripts/prepare-digest.js          # prints the JSON blob
# then the agent remixes it per prompts/daily-digest.md into digest/<date>.md
```

## Language

Default is Chinese (`config.language: "zh"`). Override at runtime:

```bash
node scripts/prepare-digest.js --language en
node scripts/prepare-digest.js --language bilingual
```

Translation is performed by the agent following `prompts/translate.md`: natural,
native-sounding Chinese, with operator terms and proper nouns kept in English
(Amazon, Walmart, TikTok Shop, Sponsored Products, Brand Registry, PPC, ACOS,
ASIN, SP-API, Search Query Performance) and URLs unchanged.

## Delivery

Default is `stdout` (show in chat, no keys, no auto-publish). The user can opt
into their own Telegram, Email, or Feishu delivery in `config/sources.json`:

```json
{ "delivery": { "method": "telegram", "chatId": "123456789" } }
{ "delivery": { "method": "feishu" } }
```

Secrets come from environment variables only (the cron sources them from
`~/.follow-amazon-daily.env`): `TELEGRAM_BOT_TOKEN`, `RESEND_API_KEY`,
`FEISHU_WEBHOOK` (+ optional `FEISHU_WEBHOOK_SECRET`). Feishu uses a custom-bot
group webhook — no app, no chatId. Send a finished digest with:

```bash
node scripts/deliver.js --file digest/2026-05-16.md
```

For an automatic daily run, onboarding installs a system crontab entry that
runs `scripts/run-daily.sh` (prepare → agent remix → deliver, with a clearly
labelled raw fallback if the Claude CLI is unavailable on the cron run).

## Sources

- Amazon SP-API docs
- Amazon Ads Library
- Buy with Prime blog
- Walmart Marketplace release notes
- Helium 10 blog
- Serious Sellers Podcast RSS
- AMZ123
- WeAreSellers RSS / HTML
- Billion Dollar Sellers archive
- MyAmazonGuy YouTube RSS

## Optional Auth

WeAreSellers and Billion Dollar Sellers can be enriched with authenticated
cookies:

```bash
export WEARESELLERS_COOKIE='name=value; other=value'
export BDS_COOKIE='name=value; other=value'
node scripts/prepare-digest.js
```

The script never persists raw authenticated page text. Authenticated insights
are returned as `privateItems` in the stdout blob only — never written to
`data/feed-amazon.json` or the public digest.

## GitHub Actions

The daily workflow tests the parser, audits sources in non-fatal dry-run mode,
refreshes `data/feed-amazon.json`, and commits **only that feed file**. The
editorial digest is produced by the agent on demand, not in CI. Keep auth
cookies out of public workflow logs.

## Feed Item Schema

Each item in `data/feed-amazon.json`:

- `id`, `source`, `sourceType`, `category`
- `title`, `url`, `publishedAt`
- `excerpt` (short metadata)
- `body` (raw readable text for public sources; empty for community /
  subscriber-gated sources)
- `tags`, `access`, `sourceReliability`

Seller impact and suggested actions are written by the agent at digest time, not
stored as canned strings.

## License

MIT
