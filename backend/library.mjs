import { db, nowMs } from "./storage.mjs";
import { httpError, readJson, requireMethod, sendJson } from "./http.mjs";
import { requireUser } from "./auth.mjs";

const getSnapshot = db.prepare("SELECT payload, updated_at FROM library_snapshots WHERE user_id = ?");
const upsertSnapshot = db.prepare(`
INSERT INTO library_snapshots (user_id, payload, updated_at) VALUES (?, ?, ?)
ON CONFLICT(user_id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at
`);

export async function handleLibrary(req, res, url) {
  if (url.pathname !== "/api/me/library") return false;
  const user = requireUser(req);
  if (req.method === "GET") return readLibrary(res, user.id);
  if (req.method === "PUT") return writeLibrary(req, res, user.id);
  throw httpError(405, "Method not allowed");
}

function readLibrary(res, userId) {
  const row = getSnapshot.get(userId);
  sendJson(res, 200, {
    library: row ? normalizeLibrary(JSON.parse(String(row.payload))) : emptyLibrary(),
    updatedAt: row ? Number(row.updated_at) : null,
  });
  return true;
}

async function writeLibrary(req, res, userId) {
  requireMethod(req, "PUT");
  const body = await readJson(req, 12_000_000);
  const existing = readExistingSnapshot(userId);
  const library = normalizeLibrary(body.library ?? body, existing);
  const updatedAt = nowMs();
  upsertSnapshot.run(userId, JSON.stringify(library), updatedAt);
  sendJson(res, 200, { library, updatedAt });
  return true;
}

function readExistingSnapshot(userId) {
  const row = getSnapshot.get(userId);
  if (!row) return null;
  try {
    return normalizeLibrary(JSON.parse(String(row.payload)));
  } catch {
    return null;
  }
}

function emptyLibrary() {
  return { version: 2, songs: [], favorites: [], playlists: [], recents: [] };
}

// 规范化为 v2：songs 显式优先，缺失则从 favorites/recents 推导；
// 旧 v1 客户端上传不带 songs 时，合并服务端已有 songs，避免把跨设备歌曲目录清空
function normalizeLibrary(input, existing = null) {
  const raw = isRecord(input) ? input : {};
  const favorites = normalizeSongs(raw.favorites);
  const playlists = normalizePlaylists(raw.playlists);
  const recents = normalizeRecents(raw.recents);
  const hasExplicitSongs = Array.isArray(raw.songs);
  const songSources = [
    ...(hasExplicitSongs ? normalizeSongs(raw.songs) : []),
    ...favorites,
    ...recents.map((recent) => recent.song),
  ];
  if (!hasExplicitSongs && existing) songSources.push(...(existing.songs ?? []));
  return { version: 2, songs: dedupeSongs(songSources), favorites, playlists, recents };
}

function normalizeSongs(value) {
  return arrayValue(value).map(normalizeSong).filter(Boolean);
}

function normalizeSong(value) {
  if (!isRecord(value)) return null;
  const stableId = stringValue(value.stableId);
  if (!stableId) return null;
  return value;
}

function normalizePlaylists(value) {
  return arrayValue(value)
    .filter(isRecord)
    .map((playlist) => ({
      ...playlist,
      id: stringValue(playlist.id),
      name: stringValue(playlist.name),
      trackIds: arrayValue(playlist.trackIds).map(stringValue).filter(Boolean),
      updatedAt: Number(playlist.updatedAt) || 0,
    }))
    .filter((playlist) => playlist.id);
}

function normalizeRecents(value) {
  return arrayValue(value)
    .filter((recent) => isRecord(recent) && isRecord(recent.song) && stringValue(recent.song.stableId))
    .map((recent) => ({ ...recent, id: stringValue(recent.id) || stringValue(recent.song.stableId), playedAt: Number(recent.playedAt) || 0 }));
}

function dedupeSongs(songs) {
  const byId = new Map();
  songs.forEach((song) => {
    if (song && stringValue(song.stableId)) byId.set(song.stableId, song);
  });
  return Array.from(byId.values());
}

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function stringValue(value) {
  return typeof value === "string" ? value : "";
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
