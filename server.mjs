import { createReadStream, existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const distDir = join(root, "dist");
const upstreams = {
  free: "https://ios.25pan.com/api/v1/freemusic",
  karpov: "https://gateway.karpov.cn",
  gdstudio: "https://music-api.gdstudio.xyz/api.php",
};
const port = Number(process.env.PORT ?? 8080);
const host = process.env.HOST ?? "0.0.0.0";

createServer(async (req, res) => {
  try {
    if (!req.url) return send(res, 400, "Bad request");
    const url = new URL(req.url, `http://${req.headers.host ?? "127.0.0.1"}`);
    if (url.pathname.startsWith("/api/music/free")) {
      await proxyMusic(url, res, { prefix: "/api/music/free", baseUrl: upstreams.free });
      return;
    }
    if (url.pathname.startsWith("/api/music/karpov")) {
      await proxyMusic(url, res, { prefix: "/api/music/karpov", baseUrl: upstreams.karpov, authorization: bearerFromEnv() });
      return;
    }
    if (url.pathname.startsWith("/api/music/gdstudio")) {
      await proxyMusic(url, res, { prefix: "/api/music/gdstudio", baseUrl: upstreams.gdstudio });
      return;
    }
    serveStatic(url.pathname, res);
  } catch (error) {
    sendJson(res, 502, { error: error instanceof Error ? error.message : "Proxy failure" });
  }
}).listen(port, host, () => {
  console.log(`music clone server listening on http://${host}:${port}`);
});

async function proxyMusic(url, res, options) {
  const upstreamPath = url.pathname.replace(options.prefix, "") || "";
  const upstreamUrl = new URL(`${options.baseUrl}${upstreamPath}`);
  url.searchParams.forEach((value, key) => upstreamUrl.searchParams.set(key, value));
  const headers = {
    accept: "application/json,text/plain,*/*",
    "user-agent": "music-clone-bff/0.1",
  };
  if (options.authorization) headers.authorization = options.authorization;
  const response = await fetch(upstreamUrl, {
    headers,
  });
  res.writeHead(response.status, filterHeaders(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
}

function bearerFromEnv() {
  const apiKey = process.env.KARPOV_API_KEY;
  return apiKey ? `Bearer ${apiKey}` : undefined;
}

function serveStatic(pathname, res) {
  const normalized = normalize(pathname).replace(/^([/\\])+/, "");
  const requested = normalized && normalized !== "." ? join(distDir, normalized) : join(distDir, "index.html");
  const filePath = existsSync(requested) ? requested : join(distDir, "index.html");
  if (!filePath.startsWith(distDir)) return send(res, 403, "Forbidden");
  res.writeHead(200, { "content-type": contentType(filePath) });
  createReadStream(filePath).pipe(res);
}

function filterHeaders(headers) {
  const result = { "access-control-allow-origin": "*" };
  const contentType = headers.get("content-type");
  const cacheControl = headers.get("cache-control");
  if (contentType) result["content-type"] = contentType;
  if (cacheControl) result["cache-control"] = cacheControl;
  return result;
}

function contentType(filePath) {
  const ext = extname(filePath);
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".js") return "text/javascript; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".svg") return "image/svg+xml";
  return "application/octet-stream";
}

function send(res, status, body) {
  res.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
  res.end(body);
}

function sendJson(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}
