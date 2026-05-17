# Translation Prompt

Apply this whenever `config.language` (or `--language`) is `zh` or `bilingual`.
Translation is done by you, the agent, as you write the digest — there is no
phrase dictionary in the code.

## Chinese mode (`zh`)

- Write the entire digest in natural, fluent Simplified Chinese. It must read
  like it was originally written in Chinese by a seasoned Amazon operator — not
  like a literal, word-by-word machine translation.
- Tone: professional but plain-spoken, 像一位懂运营的同行在跟你说重点.
- Keep these in English (operators say them in English): Amazon, Walmart,
  TikTok Shop, Buy with Prime, Sponsored Products, Sponsored Brands, Brand
  Registry, Search Query Performance, PPC, ACOS, TACoS, ASIN, SKU, FBA, FBM,
  Listing, API, SP-API, Rufus, Alexa, Prime Day.
- Never translate proper nouns: people names, company names, product names,
  tool names, podcast/newsletter names.
- Keep every URL exactly as-is. Never translate, shorten, or alter a link.
- Do not leave any English sentence sitting under a Chinese heading. If a source
  is too thin to translate meaningfully, write a short Chinese editor note
  stating what signal was captured and what to verify — never paste raw English.
- Never use em-dashes (—). Use Chinese punctuation: ，。、；：（）「」.
- Numbers, dates, and metrics stay accurate; do not round or invent.

## Bilingual mode (`bilingual`)

- Interleave English and Chinese **item by item**, not all-English then
  all-Chinese. For each item: the English lines first, then the Chinese
  translation of the same item directly below (separated by a blank line), then
  the next item.
- Category headings use the `"English / 中文"` form.
- The Chinese half must follow every Chinese-mode rule above (native phrasing,
  preserved terms, unchanged URLs, no em-dash).

## Always

- Translation changes wording, never meaning. Do not add claims, soften policy
  warnings, or drop the "verify against official sources" framing.
- Operator term casing stays canonical (e.g. "SP-API", not "sp-api").
