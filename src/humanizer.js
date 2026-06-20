const { searchLibrary } = require("./writing-library");

const EMPTY_ABSTRACTIONS = [
  "希望",
  "韧性",
  "见证",
  "提醒",
  "鲜明对比",
  "交响",
  "织锦",
  "命运齿轮",
  "史诗般",
  "心灵深处",
  "某种意义上",
  "不可言说",
  "难以名状"
];

const SUMMARY_MARKERS = [
  "他意识到",
  "他明白了",
  "这让他明白",
  "这让他意识到",
  "这象征着",
  "这意味着",
  "这不仅是",
  "更是一种",
  "从某种意义上说"
];

const FORMAL_TRANSITIONS = [
  "与此同时",
  "然而",
  "因此",
  "显然",
  "事实上",
  "毫无疑问",
  "总而言之",
  "换句话说",
  "值得注意的是"
];

const SOFTENERS = ["仿佛", "似乎", "好像", "微微", "轻轻", "不由得", "忍不住", "一种", "某种"];

const CONCRETE_DETAIL_WORDS = [
  "雨",
  "泥",
  "汤",
  "火",
  "柴",
  "钱",
  "铜币",
  "账",
  "门",
  "路",
  "鞋",
  "斗篷",
  "手",
  "碗",
  "锅",
  "烟",
  "盐",
  "面包",
  "酒",
  "钟",
  "木牌",
  "炉",
  "车",
  "马",
  "港",
  "风",
  "冷",
  "湿"
];

const HUMAN_STYLE_RULES = [
  "把结论藏进动作、物件、声音和短对白里，少用作者替角色总结主题。",
  "每段优先回答一个具体问题：谁在做什么、碰到了什么小麻烦、身体有什么反应。",
  "对话要带职业、地域、年纪、心情和利益，不要让角色轮流发表设定说明。",
  "写慢可以，但每段要推进一点关系、地点、误会、规矩、账目或情绪。",
  "景物不要只负责美；让雨、泥、火、汤、钱、床铺、门牌这些东西阻碍或推动人物。",
  "保留一点不整齐：人会停顿、误听、转移话题、嘴硬、算账、说半句。"
];

function clamp(value, min, max, fallback) {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, value));
}

function splitSentences(text) {
  return String(text || "").match(/[^。！？!?；;]+[。！？!?；;]?/g) || [];
}

function splitParagraphs(text) {
  return String(text || "")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function countTerm(text, term) {
  return String(text || "").split(term).length - 1;
}

function findTerms(text, terms) {
  return terms
    .map((term) => ({ term, count: countTerm(text, term) }))
    .filter((item) => item.count > 0);
}

function addFinding(findings, type, severity, message, suggestion, evidence = []) {
  findings.push({
    type,
    severity,
    message,
    suggestion,
    evidence
  });
}

function diagnoseText(text, options = {}) {
  const findings = [];
  const paragraphs = splitParagraphs(text);
  const sentences = splitSentences(text);
  const maxSuggestions = clamp(Number(options.maxSuggestions), 3, 20, 10);

  const abstractionHits = findTerms(text, EMPTY_ABSTRACTIONS);
  if (abstractionHits.length) {
    addFinding(
      findings,
      "empty_abstraction",
      "medium",
      "出现了容易让文字变得像总结稿的抽象词或套话。",
      "把这些词换成角色正在碰到的具体物件、动作或声音。",
      abstractionHits.slice(0, 8)
    );
  }

  const summaryHits = findTerms(text, SUMMARY_MARKERS);
  if (summaryHits.length) {
    addFinding(
      findings,
      "theme_summary",
      "high",
      "文本直接替人物说明了感悟或主题。",
      "删掉感悟句，改成一个动作、一个停顿、一句没说完的话，读者会自己接上。",
      summaryHits.slice(0, 8)
    );
  }

  const transitionHits = findTerms(text, FORMAL_TRANSITIONS);
  if (transitionHits.length) {
    addFinding(
      findings,
      "formal_transition",
      "low",
      "连接词偏论文或说明文，会削弱小说段落的自然感。",
      "用动作承接动作，或直接换段；保留少量连接词即可。",
      transitionHits.slice(0, 8)
    );
  }

  const softenerHits = findTerms(text, SOFTENERS).filter((item) => item.count >= 3);
  if (softenerHits.length) {
    addFinding(
      findings,
      "repetitive_softeners",
      "medium",
      "柔化词重复较多，句子会显得发虚。",
      "能确定的感觉就直接写；不能确定的，换成角色看见或听见的证据。",
      softenerHits.slice(0, 8)
    );
  }

  const longSentences = sentences
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 95)
    .slice(0, 5);
  if (longSentences.length) {
    addFinding(
      findings,
      "long_sentence",
      "medium",
      "有些句子过长，读起来像一次性吐出的说明。",
      "在动作转折、感官变化或对白前断句，让呼吸更像人在现场。",
      longSentences.map((sentence) => ({ term: sentence.slice(0, 80), count: sentence.length }))
    );
  }

  const longParagraphs = paragraphs
    .map((paragraph, index) => ({ index: index + 1, length: paragraph.length, preview: paragraph.slice(0, 80) }))
    .filter((paragraph) => paragraph.length > 420)
    .slice(0, 5);
  if (longParagraphs.length) {
    addFinding(
      findings,
      "dense_paragraph",
      "medium",
      "段落偏厚，容易变成整块说明。",
      "按动作、对白、观察、反应分段；每段只承担一个推进功能。",
      longParagraphs.map((paragraph) => ({ term: `第${paragraph.index}段：${paragraph.preview}`, count: paragraph.length }))
    );
  }

  const concreteHits = findTerms(text, CONCRETE_DETAIL_WORDS);
  if (text.length > 180 && concreteHits.length < 4) {
    addFinding(
      findings,
      "thin_concrete_detail",
      "high",
      "具体物件和身体感偏少，文字可能浮在主题层。",
      "补一个能被摸到、闻到、听见或花钱处理的细节。",
      concreteHits
    );
  }

  const dialogueLines = String(text || "")
    .split(/\n/)
    .filter((line) => /[“"].+[”"]/.test(line) || /^[\-—].+/.test(line));
  const formalDialogue = dialogueLines
    .filter((line) => /我认为|事实上|这意味着|显然|从逻辑上|本质上/u.test(line))
    .slice(0, 5);
  if (formalDialogue.length) {
    addFinding(
      findings,
      "over_explained_dialogue",
      "medium",
      "部分对白像在解释设定，不像人在争取利益或处理麻烦。",
      "给说话人一个具体目的：收钱、躲雨、催人干活、压价、保全面子。",
      formalDialogue.map((line) => ({ term: line.slice(0, 100), count: 1 }))
    );
  }

  const score = Math.max(0, 100 - findings.reduce((sum, finding) => {
    const penalty = finding.severity === "high" ? 18 : finding.severity === "medium" ? 10 : 5;
    return sum + penalty;
  }, 0));

  return {
    score,
    findingCount: findings.length,
    findings: findings.slice(0, maxSuggestions)
  };
}

function lightRewrite(text) {
  const replacements = [
    [/与此同时，?/g, "这时，"],
    [/然而，?/g, "可"],
    [/因此，?/g, "所以"],
    [/事实上，?/g, ""],
    [/毫无疑问，?/g, ""],
    [/总而言之，?/g, ""],
    [/换句话说，?/g, ""],
    [/值得注意的是，?/g, ""],
    [/某种意义上，?/g, ""],
    [/从某种意义上说，?/g, ""],
    [/他不由得/g, "他"],
    [/她不由得/g, "她"],
    [/这不仅仅是/g, "这不只是"],
    [/这不仅是/g, "这不只是"],
    [/更是一种/g, "也是"]
  ];

  let output = String(text || "");
  for (const [pattern, replacement] of replacements) {
    output = output.replace(pattern, replacement);
  }

  return output
    .split(/\n{2,}/)
    .map((paragraph) => {
      const sentences = splitSentences(paragraph.trim());
      if (sentences.length <= 1) {
        return paragraph.trim();
      }
      return sentences
        .map((sentence) => sentence.trim())
        .filter(Boolean)
        .join("");
    })
    .join("\n\n")
    .trim();
}

function buildRewritePrompt(input, diagnosis) {
  const mode = input.style || "novel_scene";
  const focus = input.focus || "让文字更像人在现场写下的小说段落";
  const topFindings = diagnosis.findings
    .slice(0, 6)
    .map((finding, index) => `${index + 1}. ${finding.message}${finding.suggestion ? ` 建议：${finding.suggestion}` : ""}`)
    .join("\n");

  return [
    `请按“${mode}”风格重写下方文本，目标：${focus}。`,
    "保留原始情节事实和人物关系，不新增宏大设定。",
    "优先使用具体动作、物件、声音、身体感和短对白承接，不要直接总结主题。",
    "让句子有长短变化，段落按动作或观察自然分开。",
    "如果是《斗篷下的漫长闲逛》正文，保持日常旅行、西欧奇幻、市井细节和陈渡缓慢适应的气质。",
    topFindings ? `本次需要重点修正：\n${topFindings}` : "本次没有明显硬伤，做轻微自然化即可。"
  ].join("\n");
}

function humanizeWriting(input = {}) {
  const text = String(input.text || "");
  const mode = input.mode || "both";
  const diagnosis = diagnoseText(text, input);
  const includeRewrite = mode === "rewrite" || mode === "both";
  const references = searchLibrary({
    query: [
      input.focus,
      "对白总原则 写作质量检查 具体行动 景描 章节结尾 人物声音 慢但不水"
    ].filter(Boolean).join(" "),
    categories: ["agent_instructions", "chapter_pacing", "dialogue_voice", "outline"],
    maxResults: clamp(Number(input.maxReferences), 2, 8, 4),
    snippetLength: 520
  });

  return {
    originalCharCount: text.length,
    mode,
    style: input.style || "novel_scene",
    score: diagnosis.score,
    findingCount: diagnosis.findingCount,
    findings: diagnosis.findings,
    styleRules: HUMAN_STYLE_RULES,
    rewritePrompt: buildRewritePrompt(input, diagnosis),
    humanizedText: includeRewrite ? lightRewrite(text) : undefined,
    libraryReferences: references.results
  };
}

module.exports = {
  humanizeWriting
};
