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

Optional Karpov provider key:

```bash
docker run --rm -p 8080:8080 -e KARPOV_API_KEY=your_key webmusic
```
