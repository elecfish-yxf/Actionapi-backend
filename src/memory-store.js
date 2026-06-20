const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 30;

function clamp(value, min, max, fallback) {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, value));
}

function getConfig() {
  const provider = (process.env.MEMORY_PROVIDER || "").toLowerCase().trim();
  const supabaseUrl = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "";
  const table = process.env.MEMORY_TABLE || "writing_memories";

  return {
    provider,
    supabaseUrl,
    supabaseKey,
    table,
    configured: provider === "supabase" && Boolean(supabaseUrl && supabaseKey && table)
  };
}

function configuredMessage(config) {
  if (config.configured) {
    return "Long-term memory is configured.";
  }

  return "Long-term memory is not configured. Set MEMORY_PROVIDER=supabase, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and MEMORY_TABLE on Render.";
}

function encodeQueryValue(value) {
  return encodeURIComponent(String(value || ""));
}

function supabaseHeaders(config, extra = {}) {
  return {
    apikey: config.supabaseKey,
    authorization: `Bearer ${config.supabaseKey}`,
    "content-type": "application/json",
    ...extra
  };
}

function normalizeMemory(row) {
  return {
    id: String(row.id),
    title: row.title || "",
    content: row.content || "",
    memoryType: row.memory_type || "note",
    tags: Array.isArray(row.tags) ? row.tags : [],
    source: row.source || "",
    importance: Number.isInteger(row.importance) ? row.importance : 3,
    metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {},
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || ""
  };
}

async function supabaseFetch(config, path, options = {}) {
  const url = `${config.supabaseUrl}/rest/v1/${path}`;
  let response;
  try {
    response = await fetch(url, {
      ...options,
      headers: supabaseHeaders(config, options.headers || {})
    });
  } catch (error) {
    const cause = error && error.cause ? error.cause : {};
    const details = [
      error && error.message ? error.message : "request failed",
      cause.code ? `code=${cause.code}` : "",
      cause.hostname ? `host=${cause.hostname}` : "",
      cause.reason ? `reason=${cause.reason}` : ""
    ].filter(Boolean).join("; ");
    throw new Error(`Supabase connection failed: ${details}. Check SUPABASE_URL and Render network access.`);
  }

  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch (error) {
      payload = { raw: text };
    }
  }

  if (!response.ok) {
    const message = payload && payload.message ? payload.message : `Supabase request failed with ${response.status}.`;
    throw new Error(message);
  }

  return payload;
}

async function getMemoryStatus() {
  const config = getConfig();
  return {
    provider: config.provider || "none",
    configured: config.configured,
    table: config.table,
    message: configuredMessage(config)
  };
}

async function searchMemories(options = {}) {
  const config = getConfig();
  const query = String(options.query || "").trim();
  const limit = clamp(Number(options.limit), 1, MAX_LIMIT, DEFAULT_LIMIT);
  const memoryType = String(options.memoryType || "").trim();
  const tag = String(options.tag || "").trim();

  if (!config.configured) {
    return {
      provider: config.provider || "none",
      configured: false,
      query,
      resultCount: 0,
      results: [],
      message: configuredMessage(config)
    };
  }

  const params = [
    "select=*",
    `order=importance.desc,updated_at.desc`,
    `limit=${limit}`
  ];

  if (query) {
    const escaped = query.replace(/[,*()]/g, " ");
    params.push(`or=(title.ilike.*${encodeQueryValue(escaped)}*,content.ilike.*${encodeQueryValue(escaped)}*)`);
  }
  if (memoryType) {
    params.push(`memory_type=eq.${encodeQueryValue(memoryType)}`);
  }
  if (tag) {
    params.push(`tags=cs.{${encodeQueryValue(tag)}}`);
  }

  const rows = await supabaseFetch(config, `${config.table}?${params.join("&")}`, {
    method: "GET"
  });

  const results = Array.isArray(rows) ? rows.map(normalizeMemory) : [];

  return {
    provider: "supabase",
    configured: true,
    query,
    resultCount: results.length,
    results
  };
}

async function saveMemory(input = {}) {
  const config = getConfig();
  if (!config.configured) {
    return {
      provider: config.provider || "none",
      configured: false,
      saved: false,
      message: configuredMessage(config)
    };
  }

  const now = new Date().toISOString();
  const row = {
    title: String(input.title || "").trim(),
    content: String(input.content || "").trim(),
    memory_type: String(input.memoryType || "note").trim(),
    tags: Array.isArray(input.tags) ? input.tags.map(String).filter(Boolean) : [],
    source: String(input.source || "").trim(),
    importance: clamp(Number(input.importance), 1, 5, 3),
    metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : {},
    updated_at: now
  };

  if (!row.title || !row.content) {
    throw new Error("Both title and content are required to save a memory.");
  }

  let savedRows;
  if (input.id) {
    savedRows = await supabaseFetch(config, `${config.table}?id=eq.${encodeQueryValue(input.id)}`, {
      method: "PATCH",
      headers: {
        Prefer: "return=representation"
      },
      body: JSON.stringify(row)
    });
  } else {
    savedRows = await supabaseFetch(config, config.table, {
      method: "POST",
      headers: {
        Prefer: "return=representation"
      },
      body: JSON.stringify({
        ...row,
        created_at: now
      })
    });
  }

  const saved = Array.isArray(savedRows) && savedRows[0] ? normalizeMemory(savedRows[0]) : null;
  return {
    provider: "supabase",
    configured: true,
    saved: Boolean(saved),
    memory: saved
  };
}

async function listRecentMemories(options = {}) {
  const config = getConfig();
  const limit = clamp(Number(options.limit), 1, MAX_LIMIT, DEFAULT_LIMIT);

  if (!config.configured) {
    return {
      provider: config.provider || "none",
      configured: false,
      resultCount: 0,
      results: [],
      message: configuredMessage(config)
    };
  }

  const rows = await supabaseFetch(config, `${config.table}?select=*&order=updated_at.desc&limit=${limit}`, {
    method: "GET"
  });
  const results = Array.isArray(rows) ? rows.map(normalizeMemory) : [];

  return {
    provider: "supabase",
    configured: true,
    resultCount: results.length,
    results
  };
}

async function deleteMemory(input = {}) {
  const config = getConfig();
  const id = String(input.id || "").trim();

  if (!config.configured) {
    return {
      provider: config.provider || "none",
      configured: false,
      deleted: false,
      message: configuredMessage(config)
    };
  }
  if (!id) {
    throw new Error("id is required.");
  }

  await supabaseFetch(config, `${config.table}?id=eq.${encodeQueryValue(id)}`, {
    method: "DELETE"
  });

  return {
    provider: "supabase",
    configured: true,
    deleted: true,
    id
  };
}

module.exports = {
  deleteMemory,
  getMemoryStatus,
  listRecentMemories,
  saveMemory,
  searchMemories
};
