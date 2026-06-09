import { createReadStream, existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { createServer } from "node:http";
import { fileURLToPath, pathToFileURL } from "node:url";
import { handleAuth, isRegistrationEnabled, requireUser } from "./backend/auth.mjs";
import { handleDownloads } from "./backend/downloads.mjs";
import { httpError, sendJson, sendText } from "./backend/http.mjs";
import { handleLibrary } from "./backend/library.mjs";
import { buildProxyUrl, matchesProxyPrefix } from "./backend/proxy.mjs";
import { cacheKey, getCached, setCached, ttlForPath } from "./backend/musicCache.mjs";

const root = fileURLToPath(new URL(".", import.meta.url));
const distDir = join(root, "dist");
const HTML_CACHE_CONTROL = "no-cache";
const ASSET_CACHE_CONTROL = "public, max-age=31536000, immutable";
const STATIC_CACHE_CONTROL = "public, max-age=3600";
const neteaseApiBase = process.env.NETEASE_API_BASE ?? "http://127.0.0.1:3000";
const upstreams = {
  free: "https://ios.25pan.com/api/v1/freemusic",
  karpov: "https://gateway.karpov.cn",
  gdstudio: "https://music-api.gdstudio.xyz/api.php",
  netease: neteaseApiBase,
};
const port = Number(process.env.PORT ?? 8080);
const host = process.env.HOST ?? "0.0.0.0";

export function createMusicServer() {
  return createServer(async (req, res) => {
    try {
      if (!req.url) return send(res, 400, "Bad request");
      const url = new URL(req.url, `http://${req.headers.host ?? "127.0.0.1"}`);
      if (url.pathname === "/api/config") {
        sendJson(res, 200, { registrationEnabled: isRegistrationEnabled() });
        return;
      }
      if (await handleAuth(req, res, url)) return;
      if (await handleLibrary(req, res, url)) return;
      if (await handleDownloads(req, res, url)) return;
      if (matchesProxyPrefix(url.pathname, "/api/music/free")) {
        await proxyMusic(url, res, { prefix: "/api/music/free", baseUrl: upstreams.free });
        return;
      }
      if (matchesProxyPrefix(url.pathname, "/api/music/karpov")) {
        requireAuthentication(req); // Karpov uses backend secrets, requires auth
        await proxyMusic(url, res, { prefix: "/api/music/karpov", baseUrl: upstreams.karpov, authorization: bearerFromEnv() });
        return;
      }
      if (matchesProxyPrefix(url.pathname, "/api/music/gdstudio")) {
        await proxyMusic(url, res, { prefix: "/api/music/gdstudio", baseUrl: upstreams.gdstudio });
        return;
      }
      if (matchesProxyPrefix(url.pathname, "/api/music/netease")) {
        await proxyMusic(url, res, { prefix: "/api/music/netease", baseUrl: upstreams.netease });
        return;
      }
      serveStatic(url.pathname, res);
    } catch (error) {
      const status = Number(error?.status ?? 502);
      sendJson(res, status, { error: error instanceof Error ? error.message : "Server failure" });
    }
  });
}

if (isMainModule()) {
  createMusicServer().listen(port, host, () => {
    console.log(`music clone server listening on http://${host}:${port}`);
  });
}

async function proxyMusic(url, res, options) {
  const upstreamUrl = buildProxyUrl(url, options);
  const headers = {
    accept: "application/json,text/plain,*/*",
    "user-agent": "music-clone-bff/0.1",
  };
  // 带密钥的上游（Karpov）不缓存，避免缓存鉴权相关响应
  const cacheable = !options.authorization;
  const key = cacheable ? cacheKey("GET", upstreamUrl.toString()) : null;
  if (key) {
    const hit = getCached(key);
    if (hit) {
      res.writeHead(hit.status, { ...hit.headers, "x-webmusic-cache": "HIT" });
      res.end(hit.body);
      return;
    }
  }
  if (options.authorization) headers.authorization = options.authorization;
  const response = await fetch(upstreamUrl, { headers });
  const body = Buffer.from(await response.arrayBuffer());
  const outHeaders = { ...filterHeaders(response.headers), "x-webmusic-cache": cacheable ? "MISS" : "BYPASS" };
  res.writeHead(response.status, outHeaders);
  res.end(body);
  // 仅缓存成功响应
  if (key && response.status >= 200 && response.status < 300) {
    setCached(key, { status: response.status, headers: filterHeaders(response.headers), body }, ttlForPath(upstreamUrl.pathname + upstreamUrl.search));
  }
}

function bearerFromEnv() {
  const apiKey = process.env.KARPOV_API_KEY;
  return apiKey ? `Bearer ${apiKey}` : undefined;
}

function requireAuthentication(req) {
  requireUser(req); // Throws 401 if not authenticated
}

function serveStatic(pathname, res) {
  const normalized = normalize(pathname).replace(/^([/\\])+/, "");
  const requested = normalized && normalized !== "." ? join(distDir, normalized) : join(distDir, "index.html");
  const filePath = existsSync(requested) ? requested : join(distDir, "index.html");
  if (!filePath.startsWith(distDir)) throw httpError(403, "Forbidden");
  res.writeHead(200, staticHeaders(filePath, normalized));
  createReadStream(filePath).pipe(res);
}

function staticHeaders(filePath, normalizedPath) {
  return {
    "content-type": contentType(filePath),
    "cache-control": cacheControl(filePath, normalizedPath),
  };
}

export function cacheControl(filePath, normalizedPath) {
  const browserPath = normalizedPath.replace(/\\/g, "/");
  if (filePath.endsWith("index.html")) return HTML_CACHE_CONTROL;
  if (browserPath.startsWith("assets/")) return ASSET_CACHE_CONTROL;
  return STATIC_CACHE_CONTROL;
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
  sendText(res, status, body);
}

function isMainModule() {
  return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
}
