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

### Disable user registration

By default new users can register. To turn registration off (existing users can
still sign in), set `REGISTRATION_ENABLED=false`:

```yaml
environment:
  REGISTRATION_ENABLED: "false"
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

**或在 Compose/Docker 中显式设置**：

```yaml
environment:
  COOKIE_SECURE: “true”
```

```bash
docker run --rm -p 8080:8080 -e COOKIE_SECURE=true webmusic
```

**验证方式**：登录后检查浏览器开发者工具 → Application/Storage → Cookies，`wm_session` 应包含 `Secure` 标志。

Optional Karpov provider key:

```bash
docker run --rm -p 8080:8080 -e KARPOV_API_KEY=your_key webmusic
```
