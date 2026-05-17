// Language is resolved deterministically here. All content translation
// (titles, summaries, seller impact, actions) is done by the agent following
// prompts/translate.md — there is intentionally no hardcoded phrase dictionary.
// Only the fixed category headings stay deterministic so the digest structure
// is stable across runs.

export const CATEGORY_LABELS = {
  "Official / Policy": { en: "Official / Policy", zh: "官方 / 政策" },
  "Seller Ops": { en: "Seller Ops", zh: "卖家运营" },
  "Community Pain Signals": { en: "Community Pain Signals", zh: "社区痛点信号" },
  "Podcast / Video Playbooks": { en: "Podcast / Video Playbooks", zh: "播客 / 视频打法" },
  "Newsletter / Analyst Signals": { en: "Newsletter / Analyst Signals", zh: "Newsletter / 行业观点" }
};

export function resolveLanguage(config = {}, args = {}) {
  return args.language || config.language || config.outputLanguage || "zh";
}

export function categoryLabel(category, language = "zh") {
  const entry = CATEGORY_LABELS[category];
  if (!entry) return category;
  if (language === "bilingual") return `${entry.en} / ${entry.zh}`;
  if (language === "zh") return entry.zh;
  return entry.en;
}
