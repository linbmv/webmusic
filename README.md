# WebMusic

Vue/Vite music web app with a small Node production server for static files and music API proxying.

## Local Development

```bash
npm install
npm run dev
```

## Production Build

```bash
npm run build
npm run serve
```

The production server listens on `PORT` and defaults to `8080`.

## Docker

Build and run with Docker:

```bash
docker build -t webmusic .
docker run --rm -p 8080:8080 webmusic
```

Or use Compose:

```bash
docker compose up -d --build
```

Open `http://127.0.0.1:8080/`.

Compose mounts persistent app data at `./webmusic-data:/data`. User accounts,
sync snapshots, and server-side downloads are stored there. Logged-in downloads
are saved under:

```text
webmusic-data/downloads/<user-id>/
```

When no user is signed in, downloads still use the browser download flow.

### 部署配置用 .env，避免 git pull 冲突

`docker-compose.yml` 已参数化，所有可变部署项都从同目录的 `.env` 读取（Docker Compose 自动加载）。**请把本地配置写在 `.env` 里，不要直接改 `docker-compose.yml`** —— `.env` 已被 `.gitignore` 忽略，这样 `git pull` 永远不会再因为 `docker-compose.yml` 被本地修改而冲突。

```bash
cp .env.example .env
# 按需编辑 .env（端口、注册开关、COOKIE_SECURE、数据目录、Karpov key 等）
docker compose up -d --build
```

可用变量（均可选，未设置则用默认值）：

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `WEBMUSIC_PORT` | `8080` | 宿主机映射端口 |
| `WEBMUSIC_DATA_DIR` | `./webmusic-data` | 数据持久化目录 |
| `REGISTRATION_ENABLED` | `true` | 新用户注册开关 |
| `COOKIE_SECURE` | 空（自动判定） | HTTPS Cookie Secure，见下文 |
| `KARPOV_API_KEY` | 空 | 可选 Karpov provider key |

**如果你的服务器上 `git pull` 已经因为 `docker-compose.yml` 被本地修改而报错**（`Your local changes ... would be overwritten by merge`），一次性迁移到 `.env` 即可根治：

```bash
# 1. 备份你当前改过的 compose（方便照着填 .env）
cp docker-compose.yml docker-compose.yml.bak
# 2. 丢弃对 docker-compose.yml 的本地修改，恢复为仓库版本
git checkout -- docker-compose.yml
# 3. 拉取最新代码（含参数化 compose 与 .env.example）
git pull
# 4. 用 .env 承载你的本地配置，按 docker-compose.yml.bak 里的值填写
cp .env.example .env && nano .env
# 5. 重新构建启动；确认无误后可删除备份
docker compose up -d --build
```

此后 `docker-compose.yml` 与仓库保持一致，本地差异只存在于被忽略的 `.env`，`git pull` 不再冲突。

### Disable user registration

By default new users can register. To turn registration off (existing users can
still sign in), set `REGISTRATION_ENABLED=false`（推荐写在 `.env`）：

```dotenv
# .env
REGISTRATION_ENABLED=false
```

或 `docker run` 时：

```bash
docker run --rm -p 8080:8080 -e REGISTRATION_ENABLED=false webmusic
```

关闭后，`POST /api/auth/register` 返回 `403 { “error”: “用户注册已禁用” }`，
前端会自动隐藏”创建账号”按钮（通过 `GET /api/config` 读取开关）。

### HTTPS 反向代理与 Cookie 安全

如果在 Nginx/Caddy 等反向代理后通过 HTTPS 访问，**必须**传递 `X-Forwarded-Proto` header，或显式设置环境变量 `COOKIE_SECURE=true`，否则移动端浏览器/PWA 可能因 Cookie 缺少 `Secure` 属性而丢弃登录态和同步状态。

**Nginx 示例配置**：

```nginx
location / {
  proxy_pass http://127.0.0.1:8080;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;  # 关键：告知后端协议
}
```

**Caddy 示例配置**（自动传递 `X-Forwarded-Proto`）：

```caddyfile
music.example.com {
  reverse_proxy localhost:8080
}
```

**或在 `.env` 中显式设置**（推荐）：

```dotenv
# .env
COOKIE_SECURE=true
```

亦可 `docker run` 时直接传：

```bash
docker run --rm -p 8080:8080 -e COOKIE_SECURE=true webmusic
```

**验证方式**：登录后检查浏览器开发者工具 → Application/Storage → Cookies，`wm_session` 应包含 `Secure` 标志。

Optional Karpov provider key:

```bash
docker run --rm -p 8080:8080 -e KARPOV_API_KEY=your_key webmusic
```
