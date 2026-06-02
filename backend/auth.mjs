import { createHash, pbkdf2Sync, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { db, nowMs } from "./storage.mjs";
import { clearSessionCookie, httpError, parseCookies, readJson, requireMethod, sendJson, sessionCookie } from "./http.mjs";

const sessionMaxAgeSeconds = 60 * 60 * 24 * 30;
const minPasswordLength = 6;

const insertUser = db.prepare("INSERT INTO users (id, username, password_hash, salt, created_at) VALUES (?, ?, ?, ?, ?)");
const findUserByName = db.prepare("SELECT id, username, password_hash, salt, created_at FROM users WHERE username = ?");
const findUserById = db.prepare("SELECT id, username, created_at FROM users WHERE id = ?");
const insertSession = db.prepare("INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?)");
const findSession = db.prepare(`
SELECT sessions.id AS session_id, sessions.expires_at, users.id, users.username, users.created_at
FROM sessions JOIN users ON users.id = sessions.user_id
WHERE sessions.token_hash = ?
`);
const deleteSession = db.prepare("DELETE FROM sessions WHERE token_hash = ?");
const deleteExpiredSessions = db.prepare("DELETE FROM sessions WHERE expires_at <= ?");

export async function handleAuth(req, res, url) {
  if (url.pathname === "/api/auth/register") return register(req, res);
  if (url.pathname === "/api/auth/login") return login(req, res);
  if (url.pathname === "/api/auth/logout") return logout(req, res);
  if (url.pathname === "/api/auth/me") return me(req, res);
  return false;
}

export function requireUser(req) {
  const session = currentSession(req);
  if (!session) throw httpError(401, "Not signed in");
  return session.user;
}

function currentSession(req) {
  deleteExpiredSessions.run(nowMs());
  const token = parseCookies(req.headers.cookie).get("wm_session");
  if (!token) return null;
  const row = findSession.get(hashToken(token));
  if (!row || Number(row.expires_at) <= nowMs()) return null;
  return {
    sessionId: String(row.session_id),
    user: { id: String(row.id), username: String(row.username), createdAt: Number(row.created_at) },
  };
}

async function register(req, res) {
  requireMethod(req, "POST");
  const body = await readJson(req);
  const username = normalizeUsername(body.username);
  const password = stringValue(body.password);
  if (!username) throw httpError(400, "Username is required");
  if (password.length < minPasswordLength) throw httpError(400, "Password must be at least 6 characters");
  if (findUserByName.get(username)) throw httpError(409, "Username already exists");
  const salt = randomBytes(16).toString("hex");
  const user = { id: randomUUID(), username, createdAt: nowMs() };
  insertUser.run(user.id, username, hashPassword(password, salt), salt, user.createdAt);
  const token = createSession(user.id);
  sendJson(res, 201, { user }, { "set-cookie": sessionCookie(token, sessionMaxAgeSeconds) });
  return true;
}

async function login(req, res) {
  requireMethod(req, "POST");
  const body = await readJson(req);
  const username = normalizeUsername(body.username);
  const password = stringValue(body.password);
  const row = username ? findUserByName.get(username) : null;
  if (!row || !verifyPassword(password, String(row.salt), String(row.password_hash))) throw httpError(401, "Invalid username or password");
  const user = { id: String(row.id), username: String(row.username), createdAt: Number(row.created_at) };
  const token = createSession(user.id);
  sendJson(res, 200, { user }, { "set-cookie": sessionCookie(token, sessionMaxAgeSeconds) });
  return true;
}

function logout(req, res) {
  requireMethod(req, "POST");
  const token = parseCookies(req.headers.cookie).get("wm_session");
  if (token) deleteSession.run(hashToken(token));
  sendJson(res, 200, { ok: true }, { "set-cookie": clearSessionCookie() });
  return true;
}

function me(req, res) {
  requireMethod(req, "GET");
  const session = currentSession(req);
  sendJson(res, 200, { user: session?.user ?? null });
  return true;
}

function createSession(userId) {
  const token = randomBytes(32).toString("base64url");
  const createdAt = nowMs();
  insertSession.run(randomUUID(), userId, hashToken(token), createdAt, createdAt + sessionMaxAgeSeconds * 1000);
  return token;
}

function normalizeUsername(value) {
  const username = stringValue(value).trim();
  if (!username || username.length > 40) return "";
  return username;
}

function stringValue(value) {
  return typeof value === "string" ? value : "";
}

function hashPassword(password, salt) {
  return pbkdf2Sync(password, salt, 120_000, 32, "sha256").toString("hex");
}

function verifyPassword(password, salt, expectedHash) {
  const actual = Buffer.from(hashPassword(password, salt), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

export function getUserById(id) {
  const row = findUserById.get(id);
  return row ? { id: String(row.id), username: String(row.username), createdAt: Number(row.created_at) } : null;
}
