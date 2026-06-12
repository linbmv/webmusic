import { createReadStream, existsSync, mkdirSync } from "node:fs";
import { rm, stat } from "node:fs/promises";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { downloadDir, db, nowMs } from "./storage.mjs";
import { fetchDownloadSource, writeLimitedResponse } from "./downloadSafety.mjs";
import { httpError, readJson, requireMethod, sendJson } from "./http.mjs";
import { requireUser } from "./auth.mjs";
import { findOrCreateSharedAsset, removeAssetReference } from "./sharedAssets.mjs";

const allowedProviderIds = new Set(["mock", "freeMusic", "karpov", "gdStudio", "custom"]);
const allowedSources = new Set(["netease", "kuwo", "qqmusic", "kugou", "joox"]);
const defaultMaxUserBytes = 5_000_000_000; // 5GB
const maxUserDownloadBytes = positiveInt(process.env.MAX_USER_DOWNLOAD_BYTES, defaultMaxUserBytes);

// 用户级下载锁：防止并发下载突破配额（串行队列实现）
const userDownloadLocks = new Map();

async function acquireDownloadLock(userId) {
  const existingLock = userDownloadLocks.get(userId);
  let releaseLock;
  const lockPromise = new Promise((resolve) => {
    releaseLock = resolve;
  });
  userDownloadLocks.set(userId, existingLock ? existingLock.then(() => lockPromise) : lockPromise);
  if (existingLock) await existingLock;
  return () => {
    releaseLock();
    if (userDownloadLocks.get(userId) === lockPromise) {
      userDownloadLocks.delete(userId);
    }
  };
}

const getDownloads = db.prepare(`
SELECT user_downloads.id, user_downloads.song_payload, user_downloads.quality, user_downloads.created_at,
       shared_audio_assets.id AS asset_id, shared_audio_assets.file_path, shared_audio_assets.size_bytes, shared_audio_assets.mime_type
FROM user_downloads JOIN shared_audio_assets ON shared_audio_assets.id = user_downloads.shared_asset_id
WHERE user_downloads.user_id = ?
ORDER BY user_downloads.created_at DESC
`);
const getDownload = db.prepare(`
SELECT user_downloads.id, user_downloads.song_payload, user_downloads.quality,
       shared_audio_assets.id AS asset_id, shared_audio_assets.file_path, shared_audio_assets.mime_type, shared_audio_assets.size_bytes
FROM user_downloads JOIN shared_audio_assets ON shared_audio_assets.id = user_downloads.shared_asset_id
WHERE user_downloads.user_id = ? AND user_downloads.id = ?
`);
const insertDownload = db.prepare("INSERT OR IGNORE INTO user_downloads (id, user_id, shared_asset_id, song_payload, quality, created_at) VALUES (?, ?, ?, ?, ?, ?)");
const findUserDownload = db.prepare("SELECT id, shared_asset_id FROM user_downloads WHERE user_id = ? AND shared_asset_id = ?");
const deleteDownload = db.prepare("DELETE FROM user_downloads WHERE user_id = ? AND id = ?");
const getDownloadAsset = db.prepare("SELECT shared_asset_id FROM user_downloads WHERE user_id = ? AND id = ?");

export async function handleDownloads(req, res, url) {
  if (!url.pathname.startsWith("/api/me/downloads")) return false;
  const user = requireUser(req);
  if (url.pathname === "/api/me/downloads" && req.method === "GET") return listDownloads(res, user.id);
  if (url.pathname === "/api/me/downloads" && req.method === "POST") return createDownload(req, res, user.id);
  const streamMatch = url.pathname.match(/^\/api\/me\/downloads\/([^/]+)\/stream$/);
  if (streamMatch && req.method === "GET") return streamDownload(res, user.id, streamMatch[1], req);
  const deleteMatch = url.pathname.match(/^\/api\/me\/downloads\/([^/]+)$/);
  if (deleteMatch && req.method === "DELETE") return removeDownload(res, user.id, deleteMatch[1]);
  throw httpError(405, "Method not allowed");
}

function listDownloads(res, userId) {
  const items = getDownloads.all(userId).map(toDownloadItem);
  sendJson(res, 200, { downloads: items, totalBytes: items.reduce((sum, item) => sum + item.sizeBytes, 0) });
  return true;
}

async function createDownload(req, res, userId) {
  requireMethod(req, "POST");
  const body = await readJson(req, 2_000_000);
  const song = normalizeSong(body.song);
  const quality = normalizeQuality(body.quality);
  const audioUrl = stringValue(body.audioUrl);
  if (!audioUrl) throw httpError(400, "audioUrl is required");

  // 获取用户级锁，确保并发下载串行执行
  const releaseLock = await acquireDownloadLock(userId);
  try {
    const currentTotal = totalDownloadedBytes(userId);

    // 检查是否已存在该歌曲的下载记录（通过 provider 信息查找）
    const existingSharedAsset = db.prepare(`
      SELECT sa.id FROM shared_audio_assets sa
      WHERE sa.provider_id = ? AND sa.source = ? AND sa.provider_song_id = ? AND sa.quality = ?
    `).get(song.provider.providerId, song.provider.source, song.providerSongId, quality);

    if (existingSharedAsset) {
      const existingDownload = findUserDownload.get(userId, existingSharedAsset.id);
      if (existingDownload) {
        // 用户已下载此歌曲，返回现有记录
        const download = getDownload.get(userId, existingDownload.id);
        sendJson(res, 200, { download: toDownloadItem(download) });
        return true;
      }
      // 共享资产已存在，直接创建用户引用（不占配额，因为文件已存在）
      const downloadId = randomUUID();
      insertDownload.run(downloadId, userId, existingSharedAsset.id, JSON.stringify(song), quality, nowMs());
      const download = getDownload.get(userId, downloadId);
      sendJson(res, 201, { download: toDownloadItem(download) });
      return true;
    }

    // 新下载：下载到临时文件 → 计算哈希 → 移动到全局目录
    const limitBytes = maxUserDownloadBytes - currentTotal;
    if (limitBytes <= 0) throw httpError(507, "User download quota exceeded");

    const tempDir = join(downloadDir, "temp");
    mkdirSync(tempDir, { recursive: true });
    const tempFilePath = join(tempDir, `${randomUUID()}.tmp`);

    const response = await fetchDownloadSource(audioUrl);
    await writeLimitedResponse(response, tempFilePath, { limitBytes, errorStatus: 507, errorMessage: "User download quota exceeded" });

    const fileStat = await stat(tempFilePath);
    const mimeType = response.headers.get("content-type") ?? mimeFromExt(extensionFromUrl(audioUrl, quality));

    // 查找或创建共享资产（包含哈希去重）
    const { id: sharedAssetId, file_path: finalPath, isNew } = await findOrCreateSharedAsset({
      providerId: song.provider.providerId,
      source: song.provider.source,
      providerSongId: song.providerSongId,
      quality,
      tempFilePath,
      mimeType,
      sizeBytes: fileStat.size,
    });

    // 创建用户下载记录
    const downloadId = randomUUID();
    insertDownload.run(downloadId, userId, sharedAssetId, JSON.stringify(song), quality, nowMs());

    const download = getDownload.get(userId, downloadId);
    sendJson(res, 201, { download: toDownloadItem(download) });
    return true;
  } finally {
    releaseLock();
  }
}

function streamDownload(res, userId, downloadId, req) {
  const row = getDownload.get(userId, downloadId);
  if (!row) throw httpError(404, "Download not found");
  const filePath = resolve(String(row.file_path));
  if (!existsSync(filePath)) throw httpError(404, "Downloaded file missing");
  const song = JSON.parse(String(row.song_payload));
  const fileSize = Number(row.size_bytes ?? 0);
  const rangeHeader = String(req.headers["range"] ?? "");
  const range = rangeHeader.startsWith("bytes=") ? parseRangeHeader(rangeHeader, fileSize) : null;
  if (rangeHeader.startsWith("bytes=") && !range) return rangeNotSatisfiable(res, fileSize);

  const stream = range
    ? createReadStream(filePath, { start: range.start, end: range.end })
    : createReadStream(filePath);

  // 监听流错误，避免未处理异常
  stream.on("error", (err) => {
    if (!res.headersSent) {
      res.writeHead(500, { "content-type": "text/plain" });
      res.end("Internal server error");
    } else {
      res.destroy();
    }
  });

  if (range) {
    res.writeHead(206, {
      "content-type": String(row.mime_type ?? "application/octet-stream"),
      "content-length": String(range.end - range.start + 1),
      "content-range": `bytes ${range.start}-${range.end}/${fileSize}`,
      "accept-ranges": "bytes",
      "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(fileNameFor(song, String(row.quality)))}`,
    });
    stream.pipe(res);
  } else {
    res.writeHead(200, {
      "content-type": String(row.mime_type ?? "application/octet-stream"),
      "content-length": String(fileSize),
      "accept-ranges": "bytes",
      "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(fileNameFor(song, String(row.quality)))}`,
    });
    stream.pipe(res);
  }
  return true;
}

function totalDownloadedBytes(userId) {
  return getDownloads.all(userId).reduce((sum, row) => sum + Number(row.size_bytes ?? 0), 0);
}

function normalizeSong(input) {
  if (!isRecord(input) || !isRecord(input.provider)) throw httpError(400, "song is required");
  const providerId = stringValue(input.provider.providerId);
  const source = stringValue(input.provider.source);
  const song = {
    ...input,
    stableId: stringValue(input.stableId),
    providerSongId: stringValue(input.providerSongId),
    name: stringValue(input.name),
    artistText: stringValue(input.artistText),
    provider: {
      providerId,
      source,
    },
  };
  if (!song.stableId || !song.providerSongId || !song.provider.providerId || !song.provider.source) throw httpError(400, "song identity is incomplete");
  if (!allowedProviderIds.has(providerId) || !allowedSources.has(source)) throw httpError(400, "song identity is not supported");
  if (!isSafeSegment(song.providerSongId)) throw httpError(400, "song identity contains invalid characters");
  return song;
}

function toDownloadItem(row) {
  return {
    id: String(row.id),
    song: JSON.parse(String(row.song_payload)),
    quality: String(row.quality),
    sizeBytes: Number(row.size_bytes ?? 0),
    mimeType: row.mime_type ? String(row.mime_type) : undefined,
    streamUrl: `/api/me/downloads/${row.id}/stream`,
    createdAt: Number(row.created_at),
  };
}

function normalizeAsset(row) {
  return { id: String(row.id), filePath: String(row.file_path), sizeBytes: Number(row.size_bytes ?? 0), mimeType: row.mime_type ? String(row.mime_type) : undefined };
}

function normalizeQuality(value) {
  return ["flac", "320kmp3", "128kmp3"].includes(value) ? value : "flac";
}

function stringValue(value) {
  return typeof value === "string" ? value : "";
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extensionFromUrl(url, quality) {
  const pathExt = safeUrlExtension(url);
  if (pathExt && /^[a-z0-9]{2,5}$/.test(pathExt)) return pathExt;
  if (quality === "flac") return "flac";
  return "mp3";
}

function safeUrlExtension(url) {
  try {
    return basename(new URL(url).pathname).split(".").pop()?.toLowerCase();
  } catch {
    return "";
  }
}

function mimeFromExt(ext) {
  if (ext === "flac") return "audio/flac";
  if (ext === "mp3") return "audio/mpeg";
  if (ext === "m4a" || ext === "aac") return "audio/mp4";
  return "application/octet-stream";
}

function fileNameFor(song, quality) {
  return `${sanitize(song.artistText || "Unknown")} - ${sanitize(song.name || song.providerSongId)}.${quality === "flac" ? "flac" : "mp3"}`;
}

function sanitize(value) {
  return String(value).replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, " ").trim().slice(0, 80) || "track";
}

function sanitizeSegment(value) {
  return String(value).replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 120) || "unknown";
}

function isSafeSegment(value) {
  return /^[a-zA-Z0-9_.-]{1,120}$/.test(value) && value !== "." && value !== "..";
}

function positiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseRangeHeader(rangeHeader, fileSize) {
  if (!rangeHeader || !rangeHeader.startsWith("bytes=")) return null;
  const parts = rangeHeader.slice(6).split("-");
  if (parts.length !== 2) return null;
  const startRaw = parts[0];
  const endRaw = parts[1];
  if ((!startRaw && !endRaw) || fileSize <= 0) return null;
  if (!startRaw) return suffixRange(endRaw, fileSize);
  const start = Number(startRaw);
  const end = endRaw ? Number(endRaw) : fileSize - 1;
  if (!isValidRangeNumber(start) || !isValidRangeNumber(end) || start >= fileSize || end >= fileSize || start > end) return null;
  return { start, end };
}

function suffixRange(endRaw, fileSize) {
  const suffixLength = Number(endRaw);
  if (!isValidRangeNumber(suffixLength) || suffixLength <= 0) return null;
  return { start: Math.max(fileSize - suffixLength, 0), end: fileSize - 1 };
}

function isValidRangeNumber(value) {
  return Number.isInteger(value) && value >= 0;
}

function rangeNotSatisfiable(res, fileSize) {
  res.writeHead(416, {
    "content-range": `bytes */${fileSize}`,
    "accept-ranges": "bytes",
  });
  res.end();
  return true;
}
