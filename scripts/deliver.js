#!/usr/bin/env node
// Delivery script. Sends a finished digest to the user's chosen channel.
// Dependency-free: secrets come from environment variables only (no .env
// parsing, no npm deps), consistent with how this skill handles cookies.
//
// Usage:
//   node scripts/prepare-digest.js | <agent remixes> | node scripts/deliver.js --file digest/2026-05-16.md
//   echo "digest text" | node scripts/deliver.js
//   node scripts/deliver.js --message "digest text"
//
// Delivery method + targets come from `config/sources.json` -> `delivery`:
//   { "method": "stdout" | "telegram" | "email" | "feishu",
//     "chatId": "<telegram chat id>", "email": "<address>" }
// Secrets come from env only:
//   TELEGRAM_BOT_TOKEN | RESEND_API_KEY | FEISHU_WEBHOOK (+ FEISHU_WEBHOOK_SECRET)

import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import { parseArgs, readJson, repoPath } from "./lib/common.js";

async function getDigestText(args) {
  if (typeof args.message === "string") return args.message;
  if (typeof args.file === "string") return readFile(repoPath(args.file), "utf8");
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

// Splits text into chunks no longer than maxLen, preferring to break on a
// newline near the limit so message boundaries don't land mid-sentence.
// Shared by Telegram (4000) and Feishu (large).
export function chunkText(text, maxLen) {
  const chunks = [];
  let remaining = String(text);
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }
    let splitAt = remaining.lastIndexOf("\n", maxLen);
    if (splitAt < maxLen * 0.5) splitAt = maxLen;
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt);
  }
  return chunks;
}

async function sendTelegram(text, botToken, chatId) {
  const chunks = chunkText(text, 4000);
  for (const chunk of chunks) {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: chunk,
        parse_mode: "Markdown",
        disable_web_page_preview: true
      })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      if (err.description && err.description.includes("can't parse")) {
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text: chunk, disable_web_page_preview: true })
        });
      } else {
        throw new Error(`Telegram API error: ${err.description || res.status}`);
      }
    }
    if (chunks.length > 1) await new Promise((r) => setTimeout(r, 500));
  }
}

async function sendEmail(text, apiKey, toEmail, language) {
  const subject =
    language === "en"
      ? `Amazon Seller Daily Intelligence — ${new Date().toISOString().slice(0, 10)}`
      : `Amazon 卖家每日情报 — ${new Date().toISOString().slice(0, 10)}`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      from: "Amazon Seller Daily <digest@resend.dev>",
      to: [toEmail],
      subject,
      text
    })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Resend API error: ${err.message || JSON.stringify(err)}`);
  }
}

// Builds a Feishu custom-bot text payload. When a signing secret is set on the
// bot, Feishu requires `timestamp` + `sign`, where
// sign = base64(HMAC_SHA256(key = `${timestamp}\n${secret}`, msg = "")).
export function buildFeishuPayload(text, secret, tsSeconds) {
  const payload = { msg_type: "text", content: { text } };
  if (secret) {
    const ts = String(tsSeconds ?? Math.floor(Date.now() / 1000));
    const sign = createHmac("sha256", `${ts}\n${secret}`).digest("base64");
    payload.timestamp = ts;
    payload.sign = sign;
  }
  return payload;
}

async function sendFeishu(text, webhookUrl, secret) {
  // Feishu text messages cap around 30KB; stay well under it.
  const chunks = chunkText(text, 20000);
  for (const chunk of chunks) {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(buildFeishuPayload(chunk, secret))
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || (typeof data.code === "number" && data.code !== 0)) {
      throw new Error(`Feishu API error: ${data.msg || data.code || res.status}`);
    }
    if (chunks.length > 1) await new Promise((r) => setTimeout(r, 400));
  }
}

async function main() {
  const args = parseArgs();
  let config = {};
  try {
    config = await readJson(repoPath(args.sources || "config/sources.json"));
  } catch {
    config = {};
  }
  const delivery = config.delivery || { method: "stdout" };
  const language = config.language || "zh";
  const digestText = await getDigestText(args);

  if (!digestText || digestText.trim().length === 0) {
    process.stdout.write(`${JSON.stringify({ status: "skipped", reason: "Empty digest text" })}\n`);
    return;
  }

  try {
    if (delivery.method === "telegram") {
      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      if (!botToken) throw new Error("TELEGRAM_BOT_TOKEN not set in environment");
      if (!delivery.chatId) throw new Error("delivery.chatId missing in config");
      await sendTelegram(digestText, botToken, delivery.chatId);
      process.stdout.write(`${JSON.stringify({ status: "ok", method: "telegram" })}\n`);
    } else if (delivery.method === "email") {
      const apiKey = process.env.RESEND_API_KEY;
      if (!apiKey) throw new Error("RESEND_API_KEY not set in environment");
      if (!delivery.email) throw new Error("delivery.email missing in config");
      await sendEmail(digestText, apiKey, delivery.email, language);
      process.stdout.write(`${JSON.stringify({ status: "ok", method: "email", to: delivery.email })}\n`);
    } else if (delivery.method === "feishu") {
      const webhook = process.env.FEISHU_WEBHOOK;
      if (!webhook) throw new Error("FEISHU_WEBHOOK not set in environment");
      await sendFeishu(digestText, webhook, process.env.FEISHU_WEBHOOK_SECRET);
      process.stdout.write(`${JSON.stringify({ status: "ok", method: "feishu" })}\n`);
    } else {
      process.stdout.write(`${digestText}\n`);
    }
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ status: "error", method: delivery.method, message: error.message })}\n`);
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
