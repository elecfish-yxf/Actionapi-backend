# Action API Backend

这是一个零依赖 Node.js 后端模板，用来承接后续要写的 action API。服务会根据 `src/action-registry.js` 自动生成 `/openapi.json`，因此新增 action 后可以直接把 schema 提供给需要 OpenAPI 的调用方。

## 本地启动

```powershell
node src/server.js
```

默认地址：

- 服务首页：`http://localhost:8787/`
- 健康检查：`http://localhost:8787/health`
- OpenAPI：`http://localhost:8787/openapi.json`
- 示例 action：`POST http://localhost:8787/actions/echo`

也可以设置环境变量：

```powershell
$env:PORT="8787"
$env:HOST="0.0.0.0"
$env:BASE_URL="http://localhost:8787"
node src/server.js
```

## 测试示例 action

```powershell
Invoke-RestMethod `
  -Uri "http://localhost:8787/actions/echo" `
  -Method Post `
  -ContentType "application/json" `
  -Body '{"message":"hello action api"}'
```

## 新增 action

在 `src/action-registry.js` 里复制 `echoAction`，改这几处即可：

- `id`：action 的唯一名称，也会成为 OpenAPI 的 `operationId`
- `path`：HTTP 路径，例如 `/actions/create-order`
- `summary` / `description`：给调用方看的说明
- `inputSchema`：请求 JSON schema
- `outputSchema`：响应 JSON schema
- `handler(input)`：真正的业务逻辑

保存后重启服务，再访问 `/openapi.json`，新 action 会自动出现在 OpenAPI 文档里。

## 写作资料库 actions

已将 `C:\Users\lenovo\Desktop\写作资料库` 中 20 份 `.docx` 文档索引到 `src/data/writing-library-index.json`。这些 action 均已出现在 `/openapi.json`：

| operationId | Path | 用途 |
| --- | --- | --- |
| `list_writing_documents` | `/actions/writing/list-documents` | 查看资料库文档、分类、标题和摘要 |
| `search_writing_library` | `/actions/writing/search` | 全资料库检索，返回带来源的片段 |
| `get_writing_document` | `/actions/writing/get-document` | 按 `documentId` 获取文档标题、目录和片段 |
| `get_writing_agent_instructions` | `/actions/writing/agent-instructions` | 获取写作 Agent 总指令、硬规则、质量检查清单 |
| `get_character_reference` | `/actions/writing/character-reference` | 获取人物设定、人物声音、对白约束 |
| `get_location_reference` | `/actions/writing/location-reference` | 获取地域、路线、小地点、市井生活、饮食和民俗参考 |
| `get_chapter_outline` | `/actions/writing/chapter-outline` | 获取第一卷 120 章章纲、章节节奏和开篇材料 |
| `get_writing_context_pack` | `/actions/writing/context-pack` | 按写作任务自动组装上下文包，适合正文生成前调用 |
| `get_long_term_memory_status` | `/actions/memory/status` | 检查外部长期记忆是否已经配置好 |
| `search_long_term_memory` | `/actions/memory/search` | 写作前检索长期记忆里的偏好、连续性、人物和剧情决策 |
| `save_long_term_memory` | `/actions/memory/save` | 保存稳定偏好、已确认设定、剧情决策和风格规则 |
| `list_recent_long_term_memories` | `/actions/memory/recent` | 查看最近更新的长期记忆 |
| `delete_long_term_memory` | `/actions/memory/delete` | 删除错误或过期的长期记忆 |
| `check_draft_against_writing_rules` | `/actions/writing/check-draft` | 检查草稿或剧情想法是否撞上禁写方向，并返回规则来源 |
| `humanize_writing` | `/actions/writing/humanize` | 诊断并轻量优化正文，让文字更贴近人类写作习惯 |

推荐 GPT agent 调用顺序：

1. `get_writing_context_pack`：按本次写作任务取上下文。
2. `get_chapter_outline`：如果是具体章节，补章纲和节奏。
3. `get_character_reference` / `get_location_reference`：按场景补人物声音或地点生活细节。
4. `humanize_writing`：生成后做去模板化、去空泛总结、段落呼吸和对白自然度检查。
5. `check_draft_against_writing_rules`：最后做一次硬规则校验。

长期记忆推荐流程：

1. 每次正式写作前，优先调用 `get_writing_context_pack`。它现在默认会同时检索长期记忆，返回 `memoryResults`。
2. 如果任务只需要查记忆，直接调用 `search_long_term_memory`，例如检索“用户偏好”“人物口吻”“上一章决定”。
3. 当用户确认了稳定偏好、人物设定、剧情决策、伏笔安排或写法规则后，调用 `save_long_term_memory` 保存。
4. 如果记忆被证明过期或错误，再调用 `delete_long_term_memory` 删除。

`humanize_writing` 不是另一个大模型，它会返回：

- `findings`：哪里像 AI 腔、空泛总结、说明文连接词、过长句、厚段落。
- `styleRules`：适合本项目的自然化写作规则。
- `rewritePrompt`：给 GPT agent 继续改写用的指令。
- `humanizedText`：后端做的轻量机械修订，适合当参考，不建议无脑覆盖最终稿。

## 长期记忆存储

后端支持用 Supabase 作为外部长期记忆库。Render 上需要添加这些环境变量：

- `MEMORY_PROVIDER=supabase`
- `SUPABASE_URL=<你的 Supabase Project URL>`
- `SUPABASE_SERVICE_ROLE_KEY=<你的 Supabase service_role key>`
- `MEMORY_TABLE=writing_memories`

在 Supabase SQL Editor 里执行：

```sql
create extension if not exists pgcrypto;

create table if not exists public.writing_memories (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  memory_type text not null default 'note',
  title text not null,
  content text not null,
  tags text[] not null default '{}',
  source text not null default '',
  importance int not null default 3 check (importance between 1 and 5),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists writing_memories_updated_at_idx on public.writing_memories (updated_at desc);
create index if not exists writing_memories_importance_idx on public.writing_memories (importance desc);
create index if not exists writing_memories_tags_idx on public.writing_memories using gin (tags);
```

`SUPABASE_SERVICE_ROLE_KEY` 只放在 Render 的环境变量里，不要填进 GPT Actions，也不要提交到 GitHub。

## 网页版 GPT Actions 接入

网页版 GPT Actions 需要公网 HTTPS URL，不能直接访问 `localhost`。长期使用请优先部署到 Render、Railway、Fly.io 或自己的 Docker 主机，详见 `DEPLOYMENT.md`。

正式部署后填写：

- Schema URL：`https://你的正式域名/openapi.json`
- Authentication：Bearer/API Key，值填 `ACTION_API_KEY`
- Header：`Authorization: Bearer <你的 ACTION_API_KEY>`

本地临时测试时才建议用 Cloudflare Quick Tunnel：

```powershell
$env:ACTION_API_KEY="换成一段长随机密钥"
$env:BASE_URL="https://你的-tunnel.trycloudflare.com"
node src/server.js
cloudflared tunnel --url http://localhost:8787
```

如果没有设置 `ACTION_API_KEY`，后端仍可运行，但不建议暴露到公网。

刷新资料库索引：

```powershell
& "C:\Users\lenovo\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" `
  scripts/build-writing-library-index.py `
  "C:\Users\lenovo\Desktop\写作资料库" `
  "src/data/writing-library-index.json"
```

## 导出 OpenAPI 文件

```powershell
npm run export:openapi
```

生成文件：`outputs/openapi.actionapi.json`

## Docker 部署

```powershell
docker build -t actionapi-backend .
docker run --rm -p 8787:8787 -e BASE_URL="http://localhost:8787" actionapi-backend
```
