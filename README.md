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

关闭后，`POST /api/auth/register` 返回 `403 { "error": "用户注册已禁用" }`，
前端会自动隐藏“创建账号”按钮（通过 `GET /api/config` 读取开关）。

Optional Karpov provider key:

```bash
docker run --rm -p 8080:8080 -e KARPOV_API_KEY=your_key webmusic
```
