const CATEGORY_ZH = {
  "Official / Policy": "官方 / 政策",
  "Seller Ops": "卖家运营",
  "Community Pain Signals": "社区痛点信号",
  "Podcast / Video Playbooks": "播客 / 视频打法",
  "Newsletter / Analyst Signals": "Newsletter / 行业观点"
};

const TAG_ZH = {
  advertising: "广告",
  "agency playbook": "代理商打法",
  community: "社区",
  "cross-border": "跨境",
  developer: "开发者",
  marketplace: "市场平台",
  newsletter: "newsletter",
  operations: "运营",
  playbook: "打法",
  podcast: "播客",
  "seller pain": "卖家痛点",
  strategy: "策略"
};

const TITLE_ZH = [
  [/^A guide to targeting with Sponsored Products$/i, "Sponsored Products 定向指南"],
  [/^Changelog$/i, "Walmart Marketplace 更新日志"],
  [/^Selling Partner API$/i, "Selling Partner API 官方文档"],
  [/^Buy with Prime Blog$/i, "Buy with Prime 博客"],
  [/^Blog$/i, "Helium 10 博客"],
  [/^Friday Live Amazon & Ecommerce Q&A with Noah Wickham$/i, "Noah Wickham 的 Amazon 与电商直播答疑"],
  [/^Fix Brand Name Errors After Brand Registry Without Starting Over$/i, "Brand Registry 后修复品牌名错误，不必重建链接"],
  [/^Genuine Connection Beats Conversion Optimization/i, "真实连接比单纯优化转化更重要"],
  [/^#747 - 3 Sellers Share What.s Working Now on Amazon, Walmart, and TikTok Shop$/i, "#747 - 3 位卖家分享 Amazon、Walmart 和 TikTok Shop 现在有效的打法"],
  [/^#746- TikTok Live, Shopify, & Reddit Playbook for Amazon Brands$/i, "#746 - Amazon 品牌的 TikTok Live、Shopify 和 Reddit 打法"],
  [/^#745 - Their 8-Figure Amazon & TikTok Shop Brand$/i, "#745 - 他们如何做出 8 位数 Amazon 与 TikTok Shop 品牌"],
  [/^#744 - The Truth About Competing With Chinese Sellers$/i, "#744 - 和中国卖家竞争的真实情况"],
  [/^#743 - From Childhood Friends To An 8-Figure Amazon Matcha Brand$/i, "#743 - 从儿时好友到 8 位数 Amazon 抹茶品牌"],
  [/\[ BDSN \] Rufus is dead\. Long live Alexa\./i, "[BDSN] Rufus 退场，Alexa 接棒"],
  [/\[ BDSN \] Amazon's agentic army is coming - you ready\?/i, "[BDSN] Amazon 的 AI agent 大军要来了，你准备好了吗？"],
  [/\[ BDSN \] Your margin is my opportunity - Jeff Bezos/i, "[BDSN] 你的利润空间就是我的机会"],
  [/\[ BDSN \] How Amazon's search bar actually thinks/i, "[BDSN] Amazon 搜索框到底如何理解买家意图"],
  [/\[ BDSN \] Amazon speaks: AI agents are about to kill your business/i, "[BDSN] Amazon 发声：AI agents 可能会冲击你的业务"],
  [/\[ BDSN \] Should you stop tracking your Amazon rank\?/i, "[BDSN] 你还应该继续追踪 Amazon 排名吗？"],
  [/\[ BDSN \] Amazon just killed your fake pricing/i, "[BDSN] Amazon 正在打击虚假定价"],
  [/\[ BDSN \] How much in tariff refunds will you get\?/i, "[BDSN] 你能拿回多少关税退款？"]
];

const EXCERPT_ZH = [
  [/^Changelog$/i, "Walmart Marketplace 更新日志页面，适合检查 API、平台功能、集成和卖家流程是否有近期变化。"],
  [/Discover tips to help you drive sales through targeting with Sponsored Products/i, "Amazon Ads 官方说明 Sponsored Products 定向方式，重点是如何通过关键词、商品投放和受众匹配提升销售。"],
  [/Advice, trends, and insights to help grow your business/i, "Buy with Prime 官方博客发布增长建议、趋势和运营洞察，适合关注 DTC 与 Amazon 站外转化的卖家跟进。"],
  [/Stay up-to-date on the latest Amazon FBA news/i, "Helium 10 博客聚合 Amazon FBA 新闻和卖家运营内容，可作为选品、广告、listing 和增长实验的行业参考。"],
  [/Most Amazon sellers don.t need more motivation/i, "MyAmazonGuy 的直播答疑聚焦 Amazon SEO、listing optimization、PPC 盈利能力、转化率、库存和运营问题。"],
  [/Amazon brand name changes can be fixed/i, "这条视频讲 Brand Registry 后 listing 被标成 generic 或品牌名错误时，如何用产品图、包装图、UPC 和品牌证明向 Amazon 支持申诉修复。"],
  [/authentic marketing strategies for 2026/i, "视频强调 2026 年营销不能只看视觉和转化技巧，更要理解买家真实意图，用品牌真实性建立信任。"],
  [/Three real sellers share how they found winning products/i, "三位真实卖家分享如何找到潜力产品，并在 Amazon、Walmart、TikTok Shop 和 AI 工具之间组合增长。"],
  [/men.s underwear company grew to 8-figures/i, "嘉宾拆解一个男士内衣品牌如何结合 Amazon、TikTok Live、Shopify、Reddit、产品上新和用户驱动策略做到 8 位数规模。"],
  [/husband-and-wife team shares how they survived/i, "一对夫妻卖家分享如何从挫折中调整产品和渠道，通过 Amazon、TikTok Shop 和品牌韧性做出约 2000 万美元规模。"],
  [/Chinese Amazon sellers think, launch products, build brands/i, "节目从中国卖家的视角拆解选品、上新、品牌建设和竞争方式，提醒卖家不要用刻板印象替代真实策略分析。"],
  [/turn a niche product into an 8-figure Amazon brand/i, "Naoki Matcha 创始人分享如何把小众抹茶产品做成 8 位数 Amazon 品牌，重点在品牌定位、关键词和供应链选择。"],
  [/Public archive metadata from Billion Dollar Sellers/i, "Billion Dollar Sellers 公开归档中出现该主题；订阅正文不会被持久化，适合作为趋势假设而不是事实结论。"]
];

export function resolveLanguage(config, args = {}) {
  return args.language || config.language || config.outputLanguage || "zh";
}

export function categoryLabel(category, language) {
  if (language === "bilingual") {
    const zh = CATEGORY_ZH[category];
    return zh ? `${category} / ${zh}` : category;
  }
  if (language === "zh") return CATEGORY_ZH[category] ?? category;
  return category;
}

export function labels(language) {
  if (language === "zh") {
    return {
      titlePrefix: "Amazon 卖家每日情报",
      generated: "生成时间",
      publicItems: "公开信号",
      privateSignals: "登录增强信号",
      sourceWarnings: "来源提醒",
      noSignal: "今天没有抓到公开信号。",
      happened: "发生了什么",
      impact: "卖家影响",
      action: "建议动作",
      tags: "标签",
      privateHeading: "登录增强信号（仅 stdout）",
      privateNotice: "这些内容来自登录会话，只用于临时分析，不写入公开 feed 文件。",
      publicMetadata: "已抓取公开元数据。"
    };
  }
  return {
    titlePrefix: "Amazon Seller Daily Intelligence",
    generated: "Generated",
    publicItems: "Public items",
    privateSignals: "Private auth signals",
    sourceWarnings: "Source Warnings",
    noSignal: "No public signal captured today.",
    happened: "What happened",
    impact: "Seller impact",
    action: "Suggested action",
    tags: "Tags",
    privateHeading: "Private Auth Signals (stdout-only)",
    privateNotice:
      "These items came from authenticated sessions. They are summarized for temporary analysis and are not written to the public feed file.",
    publicMetadata: "Public metadata captured."
  };
}

export function localizeItem(item, language) {
  if (language !== "zh") return item;
  return {
    ...item,
    title: translateTitle(item.title, item),
    excerpt: translateExcerpt(item.excerpt, item),
    sellerImpact: translateSellerImpact(item),
    tags: item.tags.map((tag) => TAG_ZH[tag] ?? tag)
  };
}

export function translateTitle(title, item = {}) {
  for (const [pattern, translated] of TITLE_ZH) {
    if (pattern.test(title)) return translated;
  }
  if (item.source === "Billion Dollar Sellers") {
    return title
      .replace(/^\[ BDSN \]\s*/i, "[BDSN] ")
      .replace(/AI agents?/gi, "AI agents")
      .replace(/Amazon/gi, "Amazon");
  }
  if (looksEnglish(title)) {
    return `${item.source || "来源"} 更新：${compactEnglishTitle(title)}`;
  }
  return title;
}

export function translateExcerpt(excerpt, item = {}) {
  if (!excerpt) return "";
  for (const [pattern, translated] of EXCERPT_ZH) {
    if (pattern.test(excerpt)) return translated;
  }
  if (!looksEnglish(excerpt)) return excerpt;
  if (item.sourceReliability === "official") {
    return "官方来源发布了新的公开页面或说明，需要检查是否影响政策、API、广告、物流或合规流程。";
  }
  if (item.category === "Podcast / Video Playbooks") {
    return "该音频/视频内容提供 Amazon 卖家打法线索，适合从广告、listing、转化或库存角度挑一个动作做小测试。";
  }
  if (item.category === "Newsletter / Analyst Signals") {
    return "该 newsletter 主题可作为行业趋势假设，建议结合自己的类目数据和官方信息交叉验证。";
  }
  if (item.sourceReliability === "industry") {
    return "行业来源发布了运营相关内容，可作为选品、广告、listing 或增长实验的参考。";
  }
  return "该来源出现新的公开信号，建议打开原文确认细节后再纳入运营判断。";
}

export function translateSellerImpact(item) {
  if (item.sourceReliability === "official") {
    return "优先确认它是否影响账号政策、API、广告投放、物流、价格展示或合规 SOP。";
  }
  if (item.sourceReliability === "community") {
    return "把它当成卖家痛点和异常雷达；政策结论必须回到官方来源确认。";
  }
  if (item.sourceReliability === "media") {
    return "适合提炼成一个小打法，放到广告、listing、转化或运营实验里验证。";
  }
  return "判断它是否会影响选品、广告、利润、品牌定位或增长优先级。";
}

export function suggestActionZh(item) {
  if (item.sourceReliability === "official") {
    return "今天先确认是否需要更新账号、广告、API、物流或合规 SOP。";
  }
  if (item.category === "Community Pain Signals") {
    return "记录到痛点库，等官方或多源确认后再改 SOP。";
  }
  if (item.category === "Podcast / Video Playbooks") {
    return "挑一个和当前广告、Listing 或库存问题相关的动作做小范围测试。";
  }
  if (item.category === "Newsletter / Analyst Signals") {
    return "把它写成一个假设，再用 Search Query Performance、广告报表或类目数据验证。";
  }
  return "标记一个可能影响利润、转化或运营效率的点，决定是否进入本周实验清单。";
}

function looksEnglish(value) {
  const text = String(value);
  const asciiLetters = (text.match(/[A-Za-z]/g) || []).length;
  const cjk = (text.match(/[\u3400-\u9fff]/g) || []).length;
  return asciiLetters > 12 && asciiLetters > cjk;
}

function compactEnglishTitle(title) {
  return title
    .replace(/\bwith\b/gi, "与")
    .replace(/\band\b/gi, "和")
    .replace(/\bfor\b/gi, "面向")
    .replace(/\bAmazon\b/g, "Amazon")
    .replace(/\bWalmart\b/g, "Walmart")
    .replace(/\bTikTok Shop\b/g, "TikTok Shop")
    .replace(/\s+/g, " ")
    .trim();
}
