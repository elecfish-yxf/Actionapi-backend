# 正式部署指南

这个后端已经可以长期部署为公网 HTTPS 服务，供网页版 GPT Actions 引入。

## 必填环境变量

| 变量 | 示例 | 说明 |
| --- | --- | --- |
| `HOST` | `0.0.0.0` | 云平台监听地址 |
| `PORT` | 云平台自动注入，或 `8787` | 服务端口 |
| `BASE_URL` | `https://your-domain.example.com` | 必须填正式公网 HTTPS 地址，影响 `/openapi.json` 的 `servers.url` |
| `ACTION_API_KEY` | 一段 32 位以上随机字符串 | GPT Actions 调用 action 时使用的 Bearer token |
| `CORS_ORIGINS` | `*` | GPT Actions 场景可保持 `*` |
| `MEMORY_PROVIDER` | `supabase` | 启用外部长期记忆存储 |
| `SUPABASE_URL` | `https://xxx.supabase.co` | Supabase 项目的 Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | `ey...` | 后端访问 Supabase 的服务密钥，只能放在云平台环境变量里 |
| `MEMORY_TABLE` | `writing_memories` | 长期记忆表名 |

不要把 `ACTION_API_KEY`、`SUPABASE_SERVICE_ROLE_KEY` 写进代码仓库；只放在云平台的 Environment Variables / Secrets 里。

## 推荐方案 A：Render

适合最省心部署。项目已包含 `render.yaml`。

1. 把本目录推到 GitHub 仓库。
2. Render 新建 Blueprint 或 Web Service，连接该仓库。
3. 设置环境变量：
   - `HOST=0.0.0.0`
   - `ACTION_API_KEY=<你的长随机密钥>`
   - 初次部署后拿到 Render 域名，例如 `https://actionapi-backend.onrender.com`
   - 回到环境变量里设置 `BASE_URL=https://actionapi-backend.onrender.com`
   - `MEMORY_PROVIDER=supabase`
   - `SUPABASE_URL=<你的 Supabase Project URL>`
   - `SUPABASE_SERVICE_ROLE_KEY=<你的 Supabase service_role key>`
   - `MEMORY_TABLE=writing_memories`
4. 重新部署一次。
5. 打开 `https://actionapi-backend.onrender.com/openapi.json`，确认 `servers.url` 是正式 HTTPS 地址。

GPT Actions 配置：

- Schema URL：`https://actionapi-backend.onrender.com/openapi.json`
- Authentication：API Key 或 Bearer
- Header：`Authorization`
- Value：`Bearer <ACTION_API_KEY>`

## 推荐方案 B：Railway

适合已有 Railway 项目的人。项目已包含 `railway.json`。

1. 把本目录推到 GitHub 仓库。
2. Railway 新建 Project，选择 Deploy from GitHub repo。
3. 设置变量：
   - `HOST=0.0.0.0`
   - `ACTION_API_KEY=<你的长随机密钥>`
   - `BASE_URL=<Railway 生成的 HTTPS 域名>`
4. 部署后访问 `<BASE_URL>/health` 和 `<BASE_URL>/openapi.json`。

## 推荐方案 C：Fly.io / Docker

适合想用 Docker、需要长期常驻机器的人。项目已包含 `Dockerfile` 和 `fly.toml`。

需要设置 secrets：

```bash
fly secrets set ACTION_API_KEY="<你的长随机密钥>"
fly secrets set BASE_URL="https://你的-app.fly.dev"
fly deploy
```

如使用普通 Docker 主机：

```bash
docker build -t actionapi-backend .
docker run -d \
  --name actionapi-backend \
  -p 8787:8787 \
  -e HOST=0.0.0.0 \
  -e PORT=8787 \
  -e BASE_URL=https://你的正式域名 \
  -e ACTION_API_KEY=你的长随机密钥 \
  actionapi-backend
```

需要在反向代理或云平台上开启 HTTPS。

## Supabase 长期记忆表

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

后端使用 `SUPABASE_SERVICE_ROLE_KEY` 从 Render 访问这张表。这个密钥不要填进 GPT Builder，GPT Actions 仍然只使用你的 `ACTION_API_KEY`。

## 上线后检查

```powershell
Invoke-RestMethod "https://你的正式域名/health"
Invoke-RestMethod "https://你的正式域名/openapi.json"
```

测试 action：

```powershell
$apiKey = "你的 ACTION_API_KEY"
$body = @{
  text = "与此同时，陈渡意识到这不仅是一次冒险，更是一种希望的见证。"
  mode = "both"
  style = "novel_scene"
} | ConvertTo-Json -Compress

Invoke-RestMethod `
  -Uri "https://你的正式域名/actions/writing/humanize" `
  -Method Post `
  -Headers @{ Authorization = "Bearer $apiKey" } `
  -ContentType "application/json; charset=utf-8" `
  -Body $body
```

## GPT Actions 中填写

在 GPT Builder 的“添加操作”页面：

- 身份验证：选择 API Key / Bearer 类型。
- Header name：`Authorization`
- API Key：`Bearer <你的 ACTION_API_KEY>`
- 架构：选择“通过 URL 导入”，填 `https://你的正式域名/openapi.json`。

如果界面不接受 Bearer 前缀，就把认证类型改为 Bearer token，并只填 `<ACTION_API_KEY>`。
