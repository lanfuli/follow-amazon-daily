[English](README.md) | **中文**

# follow-amazon-daily

Amazon 卖家每日情报 skill。

它把 `follow-builders` 的低摩擦聚合模式和 `wayamzpost` 的结构化、可审计工作流
风格结合起来：由确定性脚本抓取原始内容，再由 agent 改写成真正的编辑级日报，
支持中文、英文或双语。不会自动发布到任何社交平台。

## 架构（两段式）

1. **`scripts/prepare-digest.js`** — 抓取所有来源，写出确定性原始 feed
   `data/feed-amazon.json`，并把一个 JSON blob（原始 items + prompts + config
   + stats）打印到 stdout。它**不写日报**，也**不做翻译**。
2. **Agent** — 读这个 JSON，按 `prompts/daily-digest.md` 和
   `prompts/translate.md` 改写成 `digest/YYYY-MM-DD.md`。每一条都基于原始
   `body`/`excerpt` 写出**针对该条的独立摘要**——代码里没有任何固定话术字典，
   所以输出不再是重复的模板套话。

## 产物

- `data/feed-amazon.json`：确定性原始公开 feed（脚本写）
- `digest/YYYY-MM-DD.md`：编辑级日报（agent 写，绝不含登录态私有内容）
- stdout：给 agent 的完整 JSON blob，外加可选的仅 stdout 登录增强信号

## 快速开始

```bash
npm test
node scripts/audit-sources.js --dry-run
node scripts/prepare-digest.js          # 打印 JSON blob
# 然后由 agent 按 prompts/daily-digest.md 改写成 digest/<date>.md
```

## 语言

默认中文（`config.language: "zh"`）。运行时可覆盖：

```bash
node scripts/prepare-digest.js --language en
node scripts/prepare-digest.js --language bilingual
```

翻译由 agent 按 `prompts/translate.md` 完成：自然、像中文原生写作，运营术语和
专有名词保留英文（Amazon、Walmart、TikTok Shop、Sponsored Products、Brand
Registry、PPC、ACOS、ASIN、SP-API、Search Query Performance），URL 不改动。

## 投递

默认 `stdout`（在对话里展示，无需密钥，不自动发布）。用户可在
`config/sources.json` 里选择自己的 Telegram、邮箱或飞书投递：

```json
{ "delivery": { "method": "telegram", "chatId": "123456789" } }
{ "delivery": { "method": "feishu" } }
```

密钥只来自环境变量（cron 从 `~/.follow-amazon-daily.env` 读取）：
`TELEGRAM_BOT_TOKEN`、`RESEND_API_KEY`、`FEISHU_WEBHOOK`（可选
`FEISHU_WEBHOOK_SECRET`）。飞书用群里的自定义机器人 webhook——无需建应用、无需
chatId。发送成稿：

```bash
node scripts/deliver.js --file digest/2026-05-16.md
```

自动每日：onboarding 会装一条系统 crontab，跑 `scripts/run-daily.sh`（抓取 →
agent 改写 → 投递；若 cron 环境没有 Claude CLI，则产出明确标注的原始 fallback）。

## 来源

- Amazon SP-API 文档
- Amazon Ads Library
- Buy with Prime 博客
- Walmart Marketplace 更新日志
- Helium 10 博客
- Serious Sellers Podcast RSS
- AMZ123
- WeAreSellers RSS / HTML
- Billion Dollar Sellers 归档
- MyAmazonGuy YouTube RSS

## 可选登录态

WeAreSellers 和 Billion Dollar Sellers 可用登录 cookie 增强：

```bash
export WEARESELLERS_COOKIE='name=value; other=value'
export BDS_COOKIE='name=value; other=value'
node scripts/prepare-digest.js
```

脚本绝不持久化登录态原文。登录增强洞察只作为 stdout blob 里的 `privateItems`
返回，绝不写入 `data/feed-amazon.json` 或公开日报。

## GitHub Actions

每日工作流跑测试、以非致命 dry-run 审计来源、刷新 `data/feed-amazon.json`，并
**只提交该 feed 文件**。编辑级日报由 agent 按需生成，不在 CI 里产出。不要把
登录 cookie 暴露到公开工作流日志里。

## Feed 字段

`data/feed-amazon.json` 每条：

- `id`、`source`、`sourceType`、`category`
- `title`、`url`、`publishedAt`
- `excerpt`（短元数据）
- `body`（公开来源的原始正文；社区/订阅墙来源为空）
- `tags`、`access`、`sourceReliability`

卖家影响和建议动作由 agent 在生成日报时写，不再以固定字符串存储。

## License

MIT
