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
   `config.delivery` (`stdout` default, or their own Telegram / Email / Feishu).
   Never ask the user to paste a secret in chat — write it to their env file.
7. Follow `config.language` exactly. See `prompts/translate.md`.
8. Never fabricate or speculate. Every digest item must carry its original link;
   no link → exclude it. See `prompts/daily-digest.md`.

## Outputs

```
data/feed-amazon.json   # deterministic raw public feed (script-written)
digest/YYYY-MM-DD.md     # editorial digest (agent-written, no private items)
stdout                   # full JSON blob from the script (for the agent)
state-feed.json          # per-install cross-run dedup state — LOCAL ONLY
```

`state-feed.json` is gitignored runtime state. Never commit it and never ship
it: a populated state would pre-mark every item "seen" and make a fresh user's
first digest empty. A clean install has no state file, so the first run shows
everything (the welcome digest works).

## First Run — Onboarding

**Gate:** if `config/sources.json` does not have `onboardingComplete: true`, run
this flow before anything else. Drive it conversationally — *you* edit the
config and env files for the user; never make them hand-edit JSON, and **never
ask them to paste a secret into the chat**.

### Step 1 — Intro
One or two lines: this is a daily Amazon-seller intelligence digest covering
Official / Policy, Seller Ops, Community Pain Signals, Podcast / Video
Playbooks, and Newsletter / Analyst Signals. Read `config/sources.json` and tell
them the actual source names and count. One line on the two-stage model (a
script fetches raw content; you remix it into a real digest).

### Step 2 — Language
Ask: Chinese (default), English, or bilingual → set `config.language`.

### Step 3 — Frequency, time, timezone
Ask cadence: daily (default) or weekly; the local time (`HH:MM`); their IANA
timezone (e.g. `America/Los_Angeles`, `Asia/Shanghai`); and the weekday if
weekly. Set `frequency`, `deliveryTime`, `timezone`, `weeklyDay`.

### Step 4 — Delivery method
Present four options. For every keyed option, the secret rule is absolute: the
user gets the secret from the provider, and **you write it into their env file
(`~/.follow-amazon-daily.env`, which the cron sources) — they never paste it
into chat, and you never echo it back**.

- **In-chat / stdout** (default) — just show the digest here. No keys.
- **Telegram** — guide: open @BotFather → `/newbot` → copy the bot token; send
  the new bot any message; then
  `curl -s "https://api.telegram.org/bot<TOKEN>/getUpdates"` to read
  `chat.id`. You put `TELEGRAM_BOT_TOKEN` in the env file and
  `delivery.chatId` in config.
- **Email** — sign up at resend.com (free), create an API key. You put
  `RESEND_API_KEY` in the env file and the recipient in `delivery.email`.
- **Feishu** (飞书 / Lark) — in the target Feishu group: 设置 → 群机器人 →
  添加机器人 → 自定义机器人 → copy the **Webhook URL**. Optional: enable 签名校验
  and copy the secret. You put `FEISHU_WEBHOOK` (and `FEISHU_WEBHOOK_SECRET` if
  signed) in the env file. The target is whichever group the bot is in — no
  chatId needed. Set `delivery.method: "feishu"`.

When writing the env file, create/append `~/.follow-amazon-daily.env` with
`export KEY=value` lines and tell the user the file path only.

### Step 5 — Save config
Write all choices into `config/sources.json` (`language`, `frequency`,
`deliveryTime`, `timezone`, `weeklyDay`, `delivery.method` + `chatId`/`email`
as needed) and set `onboardingComplete: true`. Show a short plain-language
summary of what you saved.

### Step 6 — Schedule (system crontab)
Skip for stdout/on-demand. For telegram/email/feishu, install a crontab entry
that runs `scripts/run-daily.sh` (it does prepare → agent remix → deliver, with
a labelled raw fallback if the Claude CLI is unavailable on the cron run):

```
CRON_TZ=<their IANA tz>
<min> <hour> * * <*|weekday>  /abs/path/to/skill/scripts/run-daily.sh
```

If `CRON_TZ` is unsupported on their cron, convert their local time to UTC for
the schedule instead. Then verify by running `scripts/run-daily.sh` once and
confirming the message actually arrived in their channel. Be honest about the
raw-fallback caveat (no agent in the cron environment = structured feed, clearly
labelled, not the full editorial digest).

### Step 7 — Welcome digest
Immediately run the full pipeline once now (prepare-digest → you remix per the
prompts → deliver via their chosen method) so they see real output today. Then
ask for feedback — length, focus, tone — and apply it (edit the relevant
`prompts/` file or config), and confirm what changed.

### Step 8 — Reconfigure-by-chat reminder
Tell them everything is changeable by just asking: "switch to English / make it
weekly / change time to 8am ET / send it to Feishu instead / make summaries
shorter / show my settings". You edit config or prompts for them — and when the
time/timezone/frequency changes, you also update the crontab entry.

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
5. Deliver: if `config.delivery.method` is `telegram` / `email` / `feishu`,
   pipe the digest to `node scripts/deliver.js --file digest/<date>.md`.
   Otherwise (`stdout`) show it here. For scheduled runs this whole flow is
   wrapped by `scripts/run-daily.sh`.

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
  `timezone`, `weeklyDay` — and update the crontab entry if one exists
- "Send it to Telegram / Email / Feishu instead" → `delivery.method` (+ guide
  the key/webhook setup, secret into the env file, never in chat);
  "just show it here" → `delivery.method: "stdout"` (and remove the crontab)
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
