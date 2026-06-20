const {
  checkDraftAgainstRules,
  documentSummary,
  getCategories,
  getChapterOutline,
  getCharacterReference,
  getContextPack,
  getDocument,
  getInstructionPack,
  getLocationReference,
  library,
  searchLibrary
} = require("./writing-library");
const { humanizeWriting } = require("./humanizer");
const {
  deleteMemory,
  getMemoryStatus,
  listRecentMemories,
  saveMemory,
  searchMemories
} = require("./memory-store");

const categorySchema = {
  type: "string",
  description:
    "Optional document category, for example agent_instructions, outline, characters, dialogue_voice, region, map_routes, chapter_pacing, travel_life, food_taverns, magic_folklore."
};

const searchResultSchema = {
  type: "object",
  additionalProperties: false,
  required: ["chunkId", "documentId", "documentTitle", "category", "categoryLabel", "title", "score", "snippet"],
  properties: {
    chunkId: { type: "string" },
    documentId: { type: "string" },
    documentTitle: { type: "string" },
    category: { type: "string" },
    categoryLabel: { type: "string" },
    title: { type: "string" },
    score: { type: "number" },
    snippet: { type: "string" },
    text: { type: "string" }
  }
};

const memoryResultSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id", "title", "content", "memoryType", "tags", "source", "importance", "metadata", "createdAt", "updatedAt"],
  properties: {
    id: { type: "string" },
    title: { type: "string" },
    content: { type: "string" },
    memoryType: { type: "string" },
    tags: {
      type: "array",
      items: { type: "string" }
    },
    source: { type: "string" },
    importance: { type: "integer" },
    metadata: {
      type: "object",
      additionalProperties: true
    },
    createdAt: { type: "string" },
    updatedAt: { type: "string" }
  }
};

function actionResultSchema(extraProperties = {}, required = []) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["ok", ...required],
    properties: {
      ok: { type: "boolean" },
      ...extraProperties
    }
  };
}

const writingActions = [
  {
    id: "list_writing_documents",
    method: "POST",
    path: "/actions/writing/list-documents",
    summary: "List writing library documents",
    description:
      "List all indexed writing-library documents and categories. Use this first when the agent needs to know what references exist.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        category: categorySchema,
        includeHeadings: {
          type: "boolean",
          description: "Whether to include extracted document headings."
        }
      }
    },
    outputSchema: actionResultSchema(
      {
        libraryName: { type: "string" },
        documentCount: { type: "integer" },
        chunkCount: { type: "integer" },
        categories: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["id", "label", "documentCount"],
            properties: {
              id: { type: "string" },
              label: { type: "string" },
              documentCount: { type: "integer" }
            }
          }
        },
        documents: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: true
          }
        }
      },
      ["libraryName", "documentCount", "chunkCount", "categories", "documents"]
    ),
    async handler(input) {
      const documents = library.documents
        .filter((document) => !input.category || document.category === input.category)
        .map((document) => documentSummary(document, Boolean(input.includeHeadings)));

      return {
        ok: true,
        libraryName: library.libraryName,
        documentCount: documents.length,
        chunkCount: library.chunkCount,
        categories: getCategories(),
        documents
      };
    }
  },
  {
    id: "search_writing_library",
    method: "POST",
    path: "/actions/writing/search",
    summary: "Search writing library",
    description:
      "Search the indexed writing library and return source-grounded snippets for worldbuilding, character, dialogue, outline, route, food, travel, magic, folklore and pacing references.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["query"],
      properties: {
        query: {
          type: "string",
          minLength: 1,
          description: "Search query, such as 陈渡对白, 洛恩钟镇, 第一卷第003章, 酒馆菜单."
        },
        categories: {
          type: "array",
          items: categorySchema
        },
        documentIds: {
          type: "array",
          items: { type: "string" }
        },
        maxResults: {
          type: "integer",
          minimum: 1,
          maximum: 20
        },
        snippetLength: {
          type: "integer",
          minimum: 120,
          maximum: 1200
        },
        includeFullText: {
          type: "boolean",
          description: "Return full chunk text instead of snippets only. Use sparingly."
        }
      }
    },
    outputSchema: actionResultSchema(
      {
        query: { type: "string" },
        resultCount: { type: "integer" },
        results: {
          type: "array",
          items: searchResultSchema
        }
      },
      ["query", "resultCount", "results"]
    ),
    async handler(input) {
      return {
        ok: true,
        ...searchLibrary(input)
      };
    }
  },
  {
    id: "get_writing_document",
    method: "POST",
    path: "/actions/writing/get-document",
    summary: "Get a writing-library document",
    description:
      "Fetch metadata, headings and optional chunks for a specific writing-library document returned by list_writing_documents.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["documentId"],
      properties: {
        documentId: {
          type: "string"
        },
        includeChunks: {
          type: "boolean"
        },
        maxChunks: {
          type: "integer",
          minimum: 1,
          maximum: 80
        }
      }
    },
    outputSchema: actionResultSchema(
      {
        document: {
          type: "object",
          additionalProperties: true
        },
        chunks: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: true
          }
        }
      },
      ["document"]
    ),
    async handler(input) {
      const document = getDocument(input.documentId);
      if (!document) {
        throw new Error(`Document not found: ${input.documentId}`);
      }

      const maxChunks = Number.isInteger(input.maxChunks) ? Math.min(input.maxChunks, 80) : 20;
      const chunks = input.includeChunks
        ? library.chunks.filter((chunk) => chunk.documentId === document.id).slice(0, maxChunks)
        : [];

      return {
        ok: true,
        document: documentSummary(document, true),
        chunks
      };
    }
  },
  {
    id: "get_writing_agent_instructions",
    method: "POST",
    path: "/actions/writing/agent-instructions",
    summary: "Get writing agent instructions",
    description:
      "Retrieve the high-priority writing rules, hard constraints, chapter workflow and quality checklist for the writing GPT agent.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        scope: {
          type: "string",
          description: "Instruction focus, such as 最高优先级, 第一卷硬规则, 对白, 质量检查."
        },
        maxResults: {
          type: "integer",
          minimum: 3,
          maximum: 16
        },
        snippetLength: {
          type: "integer",
          minimum: 120,
          maximum: 1200
        }
      }
    },
    outputSchema: actionResultSchema(
      {
        query: { type: "string" },
        resultCount: { type: "integer" },
        results: {
          type: "array",
          items: searchResultSchema
        }
      },
      ["query", "resultCount", "results"]
    ),
    async handler(input) {
      return {
        ok: true,
        ...getInstructionPack(input)
      };
    }
  },
  {
    id: "get_character_reference",
    method: "POST",
    path: "/actions/writing/character-reference",
    summary: "Get character and dialogue reference",
    description:
      "Retrieve character profile, relationship, voice and dialogue guidance for a named character or scene purpose.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        name: {
          type: "string",
          description: "Character name, such as 陈渡, 罗戈, 缇安, 伊玛."
        },
        scenePurpose: {
          type: "string",
          description: "Scene intent, such as 第一卷商队对话, 酒馆闲谈, 旧地重游."
        },
        maxResults: {
          type: "integer",
          minimum: 3,
          maximum: 16
        },
        snippetLength: {
          type: "integer",
          minimum: 120,
          maximum: 1200
        }
      }
    },
    outputSchema: actionResultSchema(
      {
        query: { type: "string" },
        resultCount: { type: "integer" },
        results: {
          type: "array",
          items: searchResultSchema
        }
      },
      ["query", "resultCount", "results"]
    ),
    async handler(input) {
      return {
        ok: true,
        ...getCharacterReference(input)
      };
    }
  },
  {
    id: "get_location_reference",
    method: "POST",
    path: "/actions/writing/location-reference",
    summary: "Get location, route and local-life reference",
    description:
      "Retrieve region, route, city, tavern, food, travel-system and local-life lore for a place or route.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["locationOrRegion"],
      properties: {
        locationOrRegion: {
          type: "string",
          minLength: 1,
          description: "Location or region, such as 洛恩钟镇, 赫弥亚, 千帆海, 旅店, 酒馆."
        },
        scenePurpose: {
          type: "string",
          description: "Scene intent, such as 借宿, 打工, 过河, 听传闻."
        },
        maxResults: {
          type: "integer",
          minimum: 3,
          maximum: 16
        },
        snippetLength: {
          type: "integer",
          minimum: 120,
          maximum: 1200
        }
      }
    },
    outputSchema: actionResultSchema(
      {
        query: { type: "string" },
        resultCount: { type: "integer" },
        results: {
          type: "array",
          items: searchResultSchema
        }
      },
      ["query", "resultCount", "results"]
    ),
    async handler(input) {
      return {
        ok: true,
        ...getLocationReference(input)
      };
    }
  },
  {
    id: "get_chapter_outline",
    method: "POST",
    path: "/actions/writing/chapter-outline",
    summary: "Get chapter outline",
    description:
      "Retrieve chapter outline material, especially from the first-volume 120-chapter detailed outline and pacing guides.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        chapterNumber: {
          type: "integer",
          minimum: 1,
          maximum: 120,
          description: "First-volume chapter number."
        },
        query: {
          type: "string",
          description: "Optional outline query, such as 雨里醒来的人, 商队, 洛恩钟镇."
        },
        maxResults: {
          type: "integer",
          minimum: 2,
          maximum: 12
        },
        snippetLength: {
          type: "integer",
          minimum: 120,
          maximum: 1200
        }
      }
    },
    outputSchema: actionResultSchema(
      {
        query: { type: "string" },
        resultCount: { type: "integer" },
        results: {
          type: "array",
          items: searchResultSchema
        }
      },
      ["query", "resultCount", "results"]
    ),
    async handler(input) {
      return {
        ok: true,
        ...getChapterOutline(input)
      };
    }
  },
  {
    id: "get_writing_context_pack",
    method: "POST",
    path: "/actions/writing/context-pack",
    summary: "Build a writing context pack",
    description:
      "Build a compact, source-grounded context pack for a writing task. This action also checks long-term memory by default before drafting.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["task"],
      properties: {
        task: {
          type: "string",
          minLength: 1,
          description: "Writing task, such as 写第一卷第3章陈渡在雨路商队喝到第一碗汤."
        },
        focus: {
          type: "string",
          description: "Optional focus, such as 人物对白, 酒馆饮食, 地域风格, 章节节奏."
        },
        categories: {
          type: "array",
          items: categorySchema
        },
        maxResults: {
          type: "integer",
          minimum: 3,
          maximum: 20
        },
        snippetLength: {
          type: "integer",
          minimum: 120,
          maximum: 1200
        },
        includeMemory: {
          type: "boolean",
          description: "Whether to search long-term memory before writing. Defaults to true."
        },
        memoryLimit: {
          type: "integer",
          minimum: 1,
          maximum: 20
        }
      }
    },
    outputSchema: actionResultSchema(
      {
        task: { type: "string" },
        focus: { type: "string" },
        categories: {
          type: "array",
          items: { type: "string" }
        },
        suggestedUse: { type: "string" },
        query: { type: "string" },
        resultCount: { type: "integer" },
        results: {
          type: "array",
          items: searchResultSchema
        },
        memoryConfigured: { type: "boolean" },
        memoryResults: {
          type: "array",
          items: memoryResultSchema
        },
        memoryMessage: { type: "string" }
      },
      ["task", "categories", "suggestedUse", "query", "resultCount", "results", "memoryConfigured", "memoryResults"]
    ),
    async handler(input) {
      const contextPack = getContextPack(input);
      const includeMemory = input.includeMemory !== false;
      const memory = includeMemory
        ? await searchMemories({
            query: [input.task, input.focus].filter(Boolean).join(" "),
            limit: input.memoryLimit || 6
          })
        : {
            configured: false,
            results: [],
            message: "Long-term memory search was skipped for this request."
          };

      return {
        ok: true,
        ...contextPack,
        memoryConfigured: Boolean(memory.configured),
        memoryResults: memory.results || [],
        memoryMessage: memory.message
      };
    }
  },
  {
    id: "get_long_term_memory_status",
    method: "POST",
    path: "/actions/memory/status",
    summary: "Get long-term memory status",
    description:
      "Check whether external long-term memory storage is configured. Use this before relying on memory actions.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {}
    },
    outputSchema: actionResultSchema(
      {
        provider: { type: "string" },
        configured: { type: "boolean" },
        table: { type: "string" },
        message: { type: "string" }
      },
      ["provider", "configured", "table", "message"]
    ),
    async handler() {
      return {
        ok: true,
        ...(await getMemoryStatus())
      };
    }
  },
  {
    id: "search_long_term_memory",
    method: "POST",
    path: "/actions/memory/search",
    summary: "Search long-term memory",
    description:
      "Search external long-term writing memory. The writing agent should call this before drafting when it needs prior decisions, user preferences, continuity notes, or saved story facts.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["query"],
      properties: {
        query: {
          type: "string",
          minLength: 1,
          description: "Search query for saved memory, such as 陈渡口吻, 洛恩钟镇连续性, 用户偏好."
        },
        memoryType: {
          type: "string",
          description: "Optional type filter, such as preference, continuity, character, plot, style, note."
        },
        tag: {
          type: "string",
          description: "Optional tag filter."
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 30
        }
      }
    },
    outputSchema: actionResultSchema(
      {
        provider: { type: "string" },
        configured: { type: "boolean" },
        query: { type: "string" },
        resultCount: { type: "integer" },
        results: {
          type: "array",
          items: memoryResultSchema
        },
        message: { type: "string" }
      },
      ["provider", "configured", "query", "resultCount", "results"]
    ),
    async handler(input) {
      return {
        ok: true,
        ...(await searchMemories(input))
      };
    }
  },
  {
    id: "save_long_term_memory",
    method: "POST",
    path: "/actions/memory/save",
    summary: "Save long-term memory",
    description:
      "Save or update a durable memory item for future writing sessions. Use for stable user preferences, continuity facts, approved style rules, character decisions, and plot decisions.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["title", "content"],
      properties: {
        id: {
          type: "string",
          description: "Optional existing memory id. If provided, the memory is updated."
        },
        title: {
          type: "string",
          minLength: 1
        },
        content: {
          type: "string",
          minLength: 1
        },
        memoryType: {
          type: "string",
          description: "Type such as preference, continuity, character, plot, style, note."
        },
        tags: {
          type: "array",
          items: { type: "string" }
        },
        source: {
          type: "string",
          description: "Where this memory came from, such as user, draft_review, chapter_003."
        },
        importance: {
          type: "integer",
          minimum: 1,
          maximum: 5
        },
        metadata: {
          type: "object",
          additionalProperties: true
        }
      }
    },
    outputSchema: actionResultSchema(
      {
        provider: { type: "string" },
        configured: { type: "boolean" },
        saved: { type: "boolean" },
        memory: memoryResultSchema,
        message: { type: "string" }
      },
      ["provider", "configured", "saved"]
    ),
    async handler(input) {
      return {
        ok: true,
        ...(await saveMemory(input))
      };
    }
  },
  {
    id: "list_recent_long_term_memories",
    method: "POST",
    path: "/actions/memory/recent",
    summary: "List recent long-term memories",
    description:
      "List recently updated durable memories for inspection or debugging.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 30
        }
      }
    },
    outputSchema: actionResultSchema(
      {
        provider: { type: "string" },
        configured: { type: "boolean" },
        resultCount: { type: "integer" },
        results: {
          type: "array",
          items: memoryResultSchema
        },
        message: { type: "string" }
      },
      ["provider", "configured", "resultCount", "results"]
    ),
    async handler(input) {
      return {
        ok: true,
        ...(await listRecentMemories(input))
      };
    }
  },
  {
    id: "delete_long_term_memory",
    method: "POST",
    path: "/actions/memory/delete",
    summary: "Delete long-term memory",
    description:
      "Delete a durable memory item by id. Use sparingly, mainly when a saved memory is wrong or obsolete.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["id"],
      properties: {
        id: { type: "string", minLength: 1 }
      }
    },
    outputSchema: actionResultSchema(
      {
        provider: { type: "string" },
        configured: { type: "boolean" },
        deleted: { type: "boolean" },
        id: { type: "string" },
        message: { type: "string" }
      },
      ["provider", "configured", "deleted"]
    ),
    async handler(input) {
      return {
        ok: true,
        ...(await deleteMemory(input))
      };
    }
  },
  {
    id: "check_draft_against_writing_rules",
    method: "POST",
    path: "/actions/writing/check-draft",
    summary: "Check draft against writing rules",
    description:
      "Check a draft or scene idea against hard writing rules and return relevant rule snippets from the library.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["draft"],
      properties: {
        draft: {
          type: "string",
          minLength: 1,
          description: "Draft text or scene idea to check."
        },
        focus: {
          type: "string",
          description: "Optional check focus, such as 第一卷硬规则, 对白, 节奏, 魔法民俗."
        },
        maxResults: {
          type: "integer",
          minimum: 3,
          maximum: 12
        },
        snippetLength: {
          type: "integer",
          minimum: 120,
          maximum: 1200
        }
      }
    },
    outputSchema: actionResultSchema(
      {
        draftCharCount: { type: "integer" },
        violationCount: { type: "integer" },
        violations: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["terms", "reason"],
            properties: {
              terms: {
                type: "array",
                items: { type: "string" }
              },
              reason: { type: "string" }
            }
          }
        },
        ruleReferences: {
          type: "array",
          items: searchResultSchema
        }
      },
      ["draftCharCount", "violationCount", "violations", "ruleReferences"]
    ),
    async handler(input) {
      return {
        ok: true,
        ...checkDraftAgainstRules(input)
      };
    }
  },
  {
    id: "humanize_writing",
    method: "POST",
    path: "/actions/writing/humanize",
    summary: "Humanize writing style",
    description:
      "Diagnose and lightly humanize generated Chinese fiction so it reads less like model output and more like natural prose. Returns concrete findings, source-grounded style rules, a rewrite prompt and an optional light rewrite.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["text"],
      properties: {
        text: {
          type: "string",
          minLength: 1,
          description: "Draft text to diagnose or humanize."
        },
        mode: {
          type: "string",
          enum: ["diagnose", "rewrite", "both"],
          description: "diagnose returns issues only; rewrite includes a light deterministic rewrite; both returns everything."
        },
        style: {
          type: "string",
          enum: ["novel_scene", "dialogue", "outline_to_scene", "line_edit"],
          description: "Target style for the rewrite guidance."
        },
        focus: {
          type: "string",
          description: "Optional focus, such as 陈渡对白, 第一卷生活章, 酒馆场景, 去AI味."
        },
        maxSuggestions: {
          type: "integer",
          minimum: 3,
          maximum: 20
        },
        maxReferences: {
          type: "integer",
          minimum: 2,
          maximum: 8
        }
      }
    },
    outputSchema: actionResultSchema(
      {
        originalCharCount: { type: "integer" },
        mode: { type: "string" },
        style: { type: "string" },
        score: { type: "integer" },
        findingCount: { type: "integer" },
        findings: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["type", "severity", "message", "suggestion", "evidence"],
            properties: {
              type: { type: "string" },
              severity: { type: "string" },
              message: { type: "string" },
              suggestion: { type: "string" },
              evidence: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["term", "count"],
                  properties: {
                    term: { type: "string" },
                    count: { type: "integer" }
                  }
                }
              }
            }
          }
        },
        styleRules: {
          type: "array",
          items: { type: "string" }
        },
        rewritePrompt: { type: "string" },
        humanizedText: { type: "string" },
        libraryReferences: {
          type: "array",
          items: searchResultSchema
        }
      },
      ["originalCharCount", "mode", "style", "score", "findingCount", "findings", "styleRules", "rewritePrompt", "libraryReferences"]
    ),
    async handler(input) {
      return {
        ok: true,
        ...humanizeWriting(input)
      };
    }
  }
];

module.exports = writingActions;
