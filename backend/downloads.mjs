import { createReadStream, existsSync, mkdirSync } from "node:fs";
import { rm, stat } from "node:fs/promises";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { downloadDir, db, nowMs } from "./storage.mjs";
import { fetchDownloadSource, writeLimitedResponse } from "./downloadSafety.mjs";
import { httpError, readJson, requireMethod, sendJson } from "./http.mjs";
import { requireUser } from "./auth.mjs";

const allowedProviderIds = new Set(["mock", "freeMusic", "karpov", "gdStudio", "custom"]);
const allowedSources = new Set(["netease", "kuwo", "qqmusic", "kugou", "joox"]);
const defaultMaxUserBytes = 2_000_000_000; // 2GB
const maxUserDownloadBytes = positiveInt(process.env.MAX_USER_DOWNLOAD_BYTES, defaultMaxUserBytes);

const getDownloads = db.prepare(`
SELECT user_downloads.id, user_downloads.song_payload, user_downloads.quality, user_downloads.created_at,
       audio_assets.id AS asset_id, audio_assets.file_path, audio_assets.size_bytes, audio_assets.mime_type
FROM user_downloads JOIN audio_assets ON audio_assets.id = user_downloads.asset_id
WHERE user_downloads.user_id = ?
ORDER BY user_downloads.created_at DESC
`);
const getDownload = db.prepare(`
SELECT user_downloads.id, user_downloads.song_payload, user_downloads.quality,
       audio_assets.id AS asset_id, audio_assets.file_path, audio_assets.mime_type, audio_assets.size_bytes
FROM user_downloads JOIN audio_assets ON audio_assets.id = user_downloads.asset_id
WHERE user_downloads.user_id = ? AND user_downloads.id = ?
`);
const findAsset = db.prepare("SELECT id, file_path, size_bytes, mime_type FROM audio_assets WHERE user_id = ? AND provider_id = ? AND source = ? AND provider_song_id = ? AND quality = ?");
const insertAsset = db.prepare("INSERT INTO audio_assets (id, user_id, provider_id, source, provider_song_id, quality, file_path, mime_type, size_bytes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
const insertDownload = db.prepare("INSERT OR IGNORE INTO user_downloads (id, user_id, asset_id, song_payload, quality, created_at) VALUES (?, ?, ?, ?, ?, ?)");
const findUserDownload = db.prepare("SELECT id FROM user_downloads WHERE user_id = ? AND asset_id = ?");
const deleteDownload = db.prepare("DELETE FROM user_downloads WHERE user_id = ? AND id = ?");
const countAssetReferences = db.prepare("SELECT COUNT(*) AS ref_count FROM user_downloads WHERE asset_id = ?");
const deleteAsset = db.prepare("DELETE FROM audio_assets WHERE id = ?");
const getAssetFilePath = db.prepare("SELECT file_path FROM audio_assets WHERE id = ?");

export async function handleDownloads(req, res, url) {
  if (!url.pathname.startsWith("/api/me/downloads")) return false;
  const user = requireUser(req);
  if (url.pathname === "/api/me/downloads" && req.method === "GET") return listDownloads(res, user.id);
  if (url.pathname === "/api/me/downloads" && req.method === "POST") return createDownload(req, res, user.id);
  const streamMatch = url.pathname.match(/^\/api\/me\/downloads\/([^/]+)\/stream$/);
  if (streamMatch && req.method === "GET") return streamDownload(res, user.id, streamMatch[1]);
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
  const currentTotal = getDownloads.all(userId).reduce((sum, row) => sum + Number(row.size_bytes ?? 0), 0);
  if (currentTotal >= maxUserDownloadBytes) throw httpError(507, "User download quota exceeded");
  const asset = await ensureAsset(userId, song, quality, audioUrl);
  insertDownload.run(randomUUID(), userId, asset.id, JSON.stringify(song), quality, nowMs());
  const downloadId = findUserDownload.get(userId, asset.id)?.id;
  sendJson(res, 201, { download: { id: String(downloadId), song, quality, sizeBytes: asset.sizeBytes, streamUrl: `/api/me/downloads/${downloadId}/stream` } });
  return true;
}

function streamDownload(res, userId, downloadId) {
  const row = getDownload.get(userId, downloadId);
  if (!row) throw httpError(404, "Download not found");
  const filePath = resolve(String(row.file_path));
  if (!isInsideUserDownloads(userId, filePath) || !existsSync(filePath)) throw httpError(404, "Downloaded file missing");
  const song = JSON.parse(String(row.song_payload));
  res.writeHead(200, {
    "content-type": String(row.mime_type ?? "application/octet-stream"),
    "content-length": String(row.size_bytes ?? 0),
    "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(fileNameFor(song, String(row.quality)))}`,
  });
  createReadStream(filePath).pipe(res);
  return true;
}

async function removeDownload(res, userId, downloadId) {
  const row = getDownload.get(userId, downloadId);
  if (!row) {
    sendJson(res, 200, { ok: true });
    return true;
  }
  const assetId = String(row.asset_id ?? "");
  deleteDownload.run(userId, downloadId);
  const refCount = countAssetReferences.get(assetId)?.ref_count ?? 0;
  if (refCount === 0) {
    const assetRow = getAssetFilePath.get(assetId);
    if (assetRow) {
      const filePath = String(assetRow.file_path);
      await rm(filePath, { force: true }).catch(() => {});
    }
    deleteAsset.run(assetId);
  }
  sendJson(res, 200, { ok: true });
  return true;
}

async function ensureAsset(userId, song, quality, audioUrl) {
  const existing = findAsset.get(userId, song.provider.providerId, song.provider.source, song.providerSongId, quality);
  if (existing && existsSync(String(existing.file_path))) return normalizeAsset(existing);
  const assetId = randomUUID();
  const ext = extensionFromUrl(audioUrl, quality);
  const dir = join(userDownloadRoot(userId), song.provider.providerId, song.provider.source, sanitizeSegment(song.providerSongId));
  mkdirSync(dir, { recursive: true });
  const filePath = join(dir, `${quality}.${ext}`);
  if (!isInsideUserDownloads(userId, filePath)) throw httpError(400, "Invalid song identity");
  const response = await fetchDownloadSource(audioUrl);
  await writeLimitedResponse(response, filePath);
  const fileStat = await stat(filePath);
  const mimeType = response.headers.get("content-type") ?? mimeFromExt(ext);
  insertAsset.run(assetId, userId, song.provider.providerId, song.provider.source, song.providerSongId, quality, filePath, mimeType, fileStat.size, nowMs());
  return { id: assetId, filePath, sizeBytes: fileStat.size, mimeType };
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

function userDownloadRoot(userId) {
  return join(downloadDir, sanitizeSegment(userId));
}

function isInsideUserDownloads(userId, filePath) {
  const root = resolve(userDownloadRoot(userId));
  const child = resolve(filePath);
  const rel = relative(root, child);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
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
