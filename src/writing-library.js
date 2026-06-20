const library = require("./data/writing-library-index.json");

const DEFAULT_SNIPPET_LENGTH = 420;
const MAX_RESULTS = 20;

const CATEGORY_LABELS = {
  agent_instructions: "写作 Agent 总指令",
  chapter_pacing: "章节结构与连载节奏",
  characters: "人物设定",
  daily_life: "日常职业与市井生活",
  dialogue_voice: "对白与人物声音",
  food_taverns: "饮食与酒馆",
  local_detail: "地点细部设定",
  location_generation: "小地点生成规则",
  magic_folklore: "魔法与民俗",
  map_routes: "地图与路线",
  opening_pack: "卷一开篇准备",
  outline: "大纲与章纲",
  region: "地域设定",
  travel_life: "旅行制度与路上生活",
  worldbuilding: "世界观"
};

const DEFAULT_CONTEXT_CATEGORIES = [
  "agent_instructions",
  "outline",
  "worldbuilding",
  "characters",
  "dialogue_voice",
  "region",
  "map_routes",
  "chapter_pacing",
  "travel_life",
  "daily_life",
  "food_taverns",
  "magic_folklore",
  "location_generation",
  "local_detail",
  "opening_pack"
];

const HARD_RULES = [
  {
    terms: ["救世", "拯救世界", "世界危机"],
    reason: "资料库要求作品不是救世史诗，正文落点应回到日常旅行、路上生活与地方细节。"
  },
  {
    terms: ["升级", "系统", "任务面板", "属性点"],
    reason: "资料库明确排除升级爽文、系统流方向。"
  },
  {
    terms: ["勇者", "神使", "无冕之王"],
    reason: "陈渡不是勇者、神使或王者，而是被世界规则写错的现代外乡人。"
  },
  {
    terms: ["战争争霸", "王国大战", "称霸"],
    reason: "资料库要求避免战争争霸主线，优先写旅店、港口、道路、酒馆和市井生活。"
  },
  {
    terms: ["神器", "神谕", "命定之子"],
    reason: "魔法与民俗应保持日常化、地方化，不宜把故事推向神授史诗。"
  },
  {
    terms: ["立刻适应", "马上掌握", "瞬间学会"],
    reason: "第一卷要求陈渡通过买错东西、听错话、做错活、欠账和打零工慢慢适应。"
  },
  {
    terms: ["解释穿越", "穿越机制", "回家答案"],
    reason: "开篇和第一卷前期不应急着解释穿越机制或给出回家答案。"
  }
];

function clamp(value, min, max, fallback) {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, value));
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function tokenize(query) {
  const normalized = normalizeText(query);
  if (!normalized) {
    return [];
  }

  const directTerms = normalized
    .split(/[，。！？；、,.!?;:："'“”‘’()[\]{}<>《》\s]+/u)
    .map((term) => term.trim())
    .filter((term) => term.length >= 2);

  const cjkRuns = normalized.match(/[\u4e00-\u9fff]{4,}/gu) || [];
  const grams = [];
  for (const run of cjkRuns) {
    for (let index = 0; index <= run.length - 2 && grams.length < 40; index += 1) {
      grams.push(run.slice(index, index + 2));
    }
  }

  return unique([normalized, ...directTerms, ...grams]).slice(0, 80);
}

function getDocument(documentId) {
  return library.documents.find((document) => document.id === documentId);
}

function documentSummary(document, includeHeadings = false) {
  return {
    id: document.id,
    title: document.title,
    fileName: document.fileName,
    category: document.category,
    categoryLabel: CATEGORY_LABELS[document.category] || document.category,
    charCount: document.charCount,
    paragraphCount: document.paragraphCount,
    chunkCount: document.chunkCount,
    preview: document.preview,
    ...(includeHeadings ? { headings: document.headings } : {})
  };
}

function getCategories() {
  return library.categories.map((category) => ({
    id: category,
    label: CATEGORY_LABELS[category] || category,
    documentCount: library.documents.filter((document) => document.category === category).length
  }));
}

function scoreChunk(chunk, terms, query) {
  const title = normalizeText(chunk.title);
  const documentTitle = normalizeText(chunk.documentTitle);
  const text = normalizeText(chunk.text);
  const fullQuery = normalizeText(query);
  let score = 0;

  if (fullQuery && text.includes(fullQuery)) {
    score += 12;
  }
  if (fullQuery && title.includes(fullQuery)) {
    score += 10;
  }
  if (fullQuery && documentTitle.includes(fullQuery)) {
    score += 8;
  }

  for (const term of terms) {
    if (term.length < 2) {
      continue;
    }
    if (title.includes(term)) {
      score += term.length >= 4 ? 7 : 3;
    }
    if (documentTitle.includes(term)) {
      score += term.length >= 4 ? 5 : 2;
    }
    if (text.includes(term)) {
      const weight = term.length >= 4 ? 4 : 1;
      const occurrences = text.split(term).length - 1;
      score += Math.min(occurrences, 5) * weight;
    }
  }

  return score;
}

function makeSnippet(text, terms, query, length = DEFAULT_SNIPPET_LENGTH) {
  const snippetLength = clamp(Number(length), 120, 1200, DEFAULT_SNIPPET_LENGTH);
  const normalizedText = normalizeText(text);
  const candidates = unique([normalizeText(query), ...terms]).filter((term) => term.length >= 2);
  let hitIndex = -1;

  for (const term of candidates) {
    hitIndex = normalizedText.indexOf(term);
    if (hitIndex >= 0) {
      break;
    }
  }

  const start = hitIndex < 0 ? 0 : Math.max(0, hitIndex - Math.floor(snippetLength / 3));
  const end = Math.min(text.length, start + snippetLength);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < text.length ? "..." : "";
  return `${prefix}${text.slice(start, end)}${suffix}`;
}

function searchLibrary(options = {}) {
  const query = String(options.query || "").trim();
  const terms = tokenize(query);
  const categories = new Set(options.categories || []);
  const documentIds = new Set(options.documentIds || []);
  const maxResults = clamp(Number(options.maxResults), 1, MAX_RESULTS, 8);
  const snippetLength = clamp(Number(options.snippetLength), 120, 1200, DEFAULT_SNIPPET_LENGTH);

  const results = library.chunks
    .filter((chunk) => !categories.size || categories.has(chunk.category))
    .filter((chunk) => !documentIds.size || documentIds.has(chunk.documentId))
    .map((chunk) => ({
      chunk,
      score: query ? scoreChunk(chunk, terms, query) : 1
    }))
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score || left.chunk.id.localeCompare(right.chunk.id, "zh-CN"))
    .slice(0, maxResults)
    .map(({ chunk, score }) => ({
      chunkId: chunk.id,
      documentId: chunk.documentId,
      documentTitle: chunk.documentTitle,
      category: chunk.category,
      categoryLabel: CATEGORY_LABELS[chunk.category] || chunk.category,
      title: chunk.title,
      score,
      snippet: makeSnippet(chunk.text, terms, query, snippetLength),
      text: options.includeFullText ? chunk.text : undefined
    }));

  return {
    query,
    resultCount: results.length,
    results
  };
}

function inferContextCategories(text) {
  const value = String(text || "");
  const categoryGroups = [];

  if (/[人物|角色|对白|声音|口吻|台词]/u.test(value)) {
    categoryGroups.push("characters", "dialogue_voice", "agent_instructions");
  }
  if (/[地点|地域|城市|小镇|酒馆|旅店|路线|地图|港口|道路|北境|南岸|海]/u.test(value)) {
    categoryGroups.push(
      "region",
      "map_routes",
      "local_detail",
      "location_generation",
      "travel_life",
      "daily_life",
      "food_taverns",
      "worldbuilding"
    );
  }
  if (/[章节|章纲|大纲|节奏|连载|开篇|第一卷]/u.test(value)) {
    categoryGroups.push("outline", "chapter_pacing", "opening_pack", "agent_instructions");
  }
  if (/[魔法|民俗|传说|圣徒|龙|炉火|归途]/u.test(value)) {
    categoryGroups.push("magic_folklore", "worldbuilding", "region");
  }
  if (/[饮食|酒|饭|汤|面包|酒馆]/u.test(value)) {
    categoryGroups.push("food_taverns", "daily_life", "region");
  }

  return unique(categoryGroups.length ? categoryGroups : DEFAULT_CONTEXT_CATEGORIES);
}

function getContextPack(options = {}) {
  const task = String(options.task || "").trim();
  const focus = String(options.focus || "").trim();
  const query = [task, focus].filter(Boolean).join(" ");
  const categories = options.categories && options.categories.length
    ? options.categories
    : inferContextCategories(query);
  const maxResults = clamp(Number(options.maxResults), 3, MAX_RESULTS, 10);
  const search = searchLibrary({
    query,
    categories,
    maxResults,
    snippetLength: options.snippetLength || 520
  });

  return {
    task,
    focus,
    categories,
    suggestedUse:
      "把 returned snippets 当作写作前上下文，不要逐字拼贴；优先保持日常旅行、地方生活、陈渡缓慢适应和误传发芽的气质。",
    ...search
  };
}

function getInstructionPack(options = {}) {
  const scope = String(options.scope || "最高优先级 总则 正文 章节 质量检查 禁写").trim();
  return searchLibrary({
    query: scope,
    categories: ["agent_instructions", "chapter_pacing", "outline", "opening_pack"],
    maxResults: clamp(Number(options.maxResults), 3, 16, 10),
    snippetLength: options.snippetLength || 650
  });
}

function getCharacterReference(options = {}) {
  const query = [options.name, options.scenePurpose, "人物 声音 对白 口吻"].filter(Boolean).join(" ");
  return searchLibrary({
    query,
    categories: ["characters", "dialogue_voice", "agent_instructions"],
    maxResults: clamp(Number(options.maxResults), 3, 16, 8),
    snippetLength: options.snippetLength || 560
  });
}

function getLocationReference(options = {}) {
  const query = [options.locationOrRegion, options.scenePurpose, "地点 地域 路线 生活"].filter(Boolean).join(" ");
  return searchLibrary({
    query,
    categories: [
      "region",
      "map_routes",
      "local_detail",
      "location_generation",
      "worldbuilding",
      "travel_life",
      "daily_life",
      "food_taverns",
      "magic_folklore"
    ],
    maxResults: clamp(Number(options.maxResults), 3, 16, 8),
    snippetLength: options.snippetLength || 560
  });
}

function formatChapterNumber(chapterNumber) {
  const number = Number(chapterNumber);
  if (!Number.isInteger(number) || number < 1) {
    return "";
  }
  return `第${String(number).padStart(3, "0")}章`;
}

function getChapterOutline(options = {}) {
  const chapterToken = formatChapterNumber(options.chapterNumber);
  const query = [chapterToken, options.query, "章节 章纲"].filter(Boolean).join(" ");
  return searchLibrary({
    query,
    categories: ["outline", "opening_pack", "chapter_pacing"],
    maxResults: clamp(Number(options.maxResults), 2, 12, 6),
    snippetLength: options.snippetLength || 700
  });
}

function checkDraftAgainstRules(options = {}) {
  const draft = String(options.draft || "");
  const focus = String(options.focus || "写作质量 检查 禁写 清单").trim();
  const normalizedDraft = normalizeText(draft);
  const violations = [];

  for (const rule of HARD_RULES) {
    const matchedTerms = rule.terms.filter((term) => normalizedDraft.includes(normalizeText(term)));
    if (matchedTerms.length) {
      violations.push({
        terms: matchedTerms,
        reason: rule.reason
      });
    }
  }

  const ruleReferences = searchLibrary({
    query: [focus, draft.slice(0, 300)].join(" "),
    categories: ["agent_instructions", "chapter_pacing", "outline", "dialogue_voice", "magic_folklore"],
    maxResults: clamp(Number(options.maxResults), 3, 12, 6),
    snippetLength: options.snippetLength || 520
  });

  return {
    draftCharCount: draft.length,
    violationCount: violations.length,
    violations,
    ruleReferences: ruleReferences.results
  };
}

module.exports = {
  CATEGORY_LABELS,
  library,
  checkDraftAgainstRules,
  documentSummary,
  getCategories,
  getChapterOutline,
  getCharacterReference,
  getContextPack,
  getDocument,
  getInstructionPack,
  getLocationReference,
  searchLibrary
};
