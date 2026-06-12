import { db, nowMs } from "./storage.mjs";
import { httpError, readJson, requireMethod, sendJson } from "./http.mjs";
import { requireUser } from "./auth.mjs";

const getPlaybackState = db.prepare("SELECT payload, updated_at FROM playback_state WHERE user_id = ?");
const upsertPlaybackState = db.prepare(`
INSERT INTO playback_state (user_id, payload, updated_at) VALUES (?, ?, ?)
ON CONFLICT(user_id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at
`);

export async function handlePlayback(req, res, url) {
  if (url.pathname !== "/api/me/playback") return false;
  const user = requireUser(req);
  if (req.method === "GET") return readPlayback(res, user.id);
  if (req.method === "PUT") return writePlayback(req, res, user.id);
  throw httpError(405, "Method not allowed");
}

function readPlayback(res, userId) {
  const row = getPlaybackState.get(userId);
  sendJson(res, 200, {
    state: row ? JSON.parse(String(row.payload)) : null,
    updatedAt: row ? Number(row.updated_at) : null,
  });
  return true;
}

async function writePlayback(req, res, userId) {
  requireMethod(req, "PUT");
  const body = await readJson(req, 2_000_000);
  if (!body || typeof body.state !== "object" || body.state === null || Array.isArray(body.state)) {
    throw httpError(400, "state must be a non-null object");
  }
  const state = body.state;
  if (typeof state.mode !== "string" || typeof state.quality !== "string" || typeof state.cursor !== "number" || typeof state.currentTimeMs !== "number" || !Array.isArray(state.queue)) {
    throw httpError(400, "state missing required fields or invalid types");
  }
  if (state.queue.length > 1000) {
    throw httpError(400, "queue length exceeds maximum (1000)");
  }
  const updatedAt = nowMs();
  upsertPlaybackState.run(userId, JSON.stringify(state), updatedAt);
  sendJson(res, 200, { state, updatedAt });
  return true;
}
