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
    library: row ? JSON.parse(String(row.payload)) : emptyLibrary(),
    updatedAt: row ? Number(row.updated_at) : null,
  });
  return true;
}

async function writeLibrary(req, res, userId) {
  requireMethod(req, "PUT");
  const body = await readJson(req, 8_000_000);
  const library = normalizeLibrary(body.library ?? body);
  const updatedAt = nowMs();
  upsertSnapshot.run(userId, JSON.stringify(library), updatedAt);
  sendJson(res, 200, { library, updatedAt });
  return true;
}

function emptyLibrary() {
  return { favorites: [], playlists: [], recents: [] };
}

function normalizeLibrary(input) {
  const raw = isRecord(input) ? input : {};
  return {
    favorites: arrayValue(raw.favorites),
    playlists: arrayValue(raw.playlists),
    recents: arrayValue(raw.recents),
  };
}

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
