---
name: follow-amazon-daily
description: Generate a daily bilingual Amazon-seller intelligence digest from public official, industry, community, podcast, newsletter, and YouTube sources. Use when the user asks for Amazon seller daily news, Amazon marketplace intelligence, WeAreSellers/BDS/MyAmazonGuy/Serious Sellers monitoring, or a concise action-oriented seller digest. The script only fetches raw content; the agent remixes it into the digest. Never auto-publishes to social platforms.
version: 0.2.0
---

# follow-amazon-daily

Generate a daily Amazon seller intelligence digest. Default language is Chinese.

This skill is split into two stages, like `follow-builders`:

1. **`scripts/prepare-digest.js`** fetches sources deterministically and prints a
   single JSON blob (raw items + prompts + config). It does **not** write the
   final digest.
2. **You, the agent**, read that JSON and remix it into a real editorial digest
   following `prompts/daily-digest.md` and `prompts/translate.md`. You write
   `digest/<date>.md` and optionally deliver it via `scripts/deliver.js`.

The point of the split: summaries and translation are written by you from the
raw `excerpt`/`body`, never by a hardcoded phrase dictionary. Every item gets
its own specific summary.

## Hard Rules

1. Public sources are the default. Authenticated WeAreSellers and Billion Dollar
   Sellers content is optional and only enabled when `WEARESELLERS_COOKIE` or
   `BDS_COOKIE` is present.
2. Never ask for or store account passwords. Only use cookie/session env vars or
   a local logged-in browser workflow the user adds later.
3. Authenticated full text is ephemeral. Use it to derive short insights only.
   Never write raw HTML, raw article text, or full subscriber/community posts to
   `data/feed-amazon.json` or `digest/<date>.md`. `privateItems` are stdout-only.
4. WeAreSellers is a community pain-signal source, not policy authority. Confirm
   policy claims with official sources.
5. Billion Dollar Sellers is industry opinion unless confirmed elsewhere.
6. No auto-publishing to social platforms (Notion, Xiaohongshu, LinkedIn, X,
   Instagram). Delivery is limited to what the user explicitly configures in
   `config.delivery` (`stdout` default, or their own Telegram/email).
7. Follow `config.language` exactly. See `prompts/translate.md`.
8. Never fabricate or speculate. Every digest item must carry its original link;
   no link → exclude it. See `prompts/daily-digest.md`.

## Outputs

```
data/feed-amazon.json   # deterministic raw public feed (script-written)
digest/YYYY-MM-DD.md     # editorial digest (agent-written, no private items)
stdout                   # full JSON blob from the script (for the agent)
```

## First Run — Onboarding

If the user is setting this up for the first time (no delivery preferences
chosen yet), walk them through it conversationally. Do not make them edit files.

1. **Intro** — one or two lines on what this digest covers (official/policy,
   seller ops, community pain, podcast/video playbooks, newsletter signals).
2. **Language** — Chinese (default), English, or bilingual.
3. **Frequency & time** — daily (default) or weekly; what local time and
   timezone. (Used only if they want a scheduled run.)
4. **Delivery** —
   - **stdout / in-chat** (default): just show the digest here. No keys needed.
   - **Telegram**: guide them through @BotFather → bot token → chat id. Token
     goes in env `TELEGRAM_BOT_TOKEN`; chat id in `config.delivery.chatId`.
   - **Email**: free Resend key in env `RESEND_API_KEY`;
     `config.delivery.email` is the recipient.
5. **Save config** — write their choices into `config/sources.json`
   (`language`, `frequency`, `deliveryTime`, `delivery.method`, etc.).
6. **Optional schedule** — only for Telegram/email delivery, set up a cron that
   runs `prepare-digest.js`, has the agent remix, then pipes to `deliver.js`.
   For stdout/in-chat, skip cron — it is on-demand.
7. **Welcome digest** — run the daily workflow once now so they see real output,
   then ask if length/focus/tone needs adjusting and apply it.

## Daily Workflow

From the repo root:

```bash
node scripts/prepare-digest.js          # prints JSON blob to stdout
```

Then:

1. Parse the JSON blob (`config`, `items`, `privateItems`, `prompts`, `stats`,
   `errors`).
2. If `stats.publicItems` is 0, tell the user no public signal was captured and
   stop.
3. Remix into the digest following `blob.prompts.dailyDigest`. Translate per
   `blob.prompts.translate` and `blob.config.language`. Base each summary on the
   item `body` first, then `excerpt`. Never reuse a sentence across items.
4. Write the public digest to `digest/<date>.md` (must contain **no**
   `privateItems` content).
5. Deliver: if `config.delivery.method` is `telegram`/`email`, pipe the digest
   to `node scripts/deliver.js --file digest/<date>.md`. Otherwise show it here.

Useful options:

```bash
node scripts/prepare-digest.js --date 2026-05-16
node scripts/prepare-digest.js --language en
node scripts/prepare-digest.js --public-only
node scripts/prepare-digest.js --quiet      # no stdout (CI feed refresh only)
node scripts/prepare-digest.js --dry-run    # do not write data/feed-amazon.json
node scripts/audit-sources.js --dry-run
```

## Configuration Handling

When the user asks to change something, edit `config/sources.json` and confirm:

- "Switch to English / bilingual" → `language`
- "Make it weekly" / "change time to 8am ET" → `frequency`, `deliveryTime`,
  `timezone` (and update the cron if one exists)
- "Send it to Telegram / email instead" → `delivery.method` (+ guide key/target
  setup); "just show it here" → `delivery.method: "stdout"`
- "Make summaries shorter / focus more on X / change tone" → edit the relevant
  file in `prompts/` and tell them it applies next run
- "Show my settings / sources" → read and display `config/sources.json`

## Source Policy

- Official / Policy: Amazon and Walmart pages override community or media claims.
- Seller Ops: industry sources can suggest experiments, not policy conclusions.
- Community Pain Signals: WeAreSellers for repeated pain, confusion,
  account-risk patterns, operational friction.
- Podcast / Video Playbooks: Serious Sellers Podcast and MyAmazonGuy for tactics.
- Newsletter / Analyst Signals: BDS for strategic opinion and trend hypotheses.

## Authenticated Sources

Optional env vars:

```bash
export WEARESELLERS_COOKIE='name=value; other=value'
export BDS_COOKIE='name=value; other=value'
```

When present, the script attempts authenticated fetches for the top public links
from those sources and returns them as `privateItems` for in-memory, stdout-only
insight. The public feed and the public digest still exclude raw authenticated
content.

## Before Trusting a Digest

```bash
npm test
node scripts/audit-sources.js --dry-run
```

If a source is flagged, treat the digest as partial and check `errors` in the
JSON blob / `data/feed-amazon.json`.
