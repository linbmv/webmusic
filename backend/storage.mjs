import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

export const dataDir = resolve(process.env.DATA_DIR ?? join(process.cwd(), "data"));
export const downloadDir = resolve(process.env.DOWNLOAD_DIR ?? join(dataDir, "downloads"));
const dbPath = resolve(process.env.DATABASE_PATH ?? join(dataDir, "webmusic.sqlite"));

mkdirSync(dataDir, { recursive: true });
mkdirSync(downloadDir, { recursive: true });
mkdirSync(dirname(dbPath), { recursive: true });

export const db = new DatabaseSync(dbPath);
db.exec("PRAGMA foreign_keys = ON");
db.exec("PRAGMA journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS library_snapshots (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  payload TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS shared_audio_assets (
  id TEXT PRIMARY KEY,
  content_hash TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  source TEXT NOT NULL,
  provider_song_id TEXT NOT NULL,
  quality TEXT NOT NULL,
  file_path TEXT NOT NULL,
  mime_type TEXT,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  ref_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  UNIQUE(content_hash),
  UNIQUE(provider_id, source, provider_song_id, quality)
);

CREATE TABLE IF NOT EXISTS user_downloads (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shared_asset_id TEXT NOT NULL REFERENCES shared_audio_assets(id) ON DELETE CASCADE,
  song_payload TEXT NOT NULL,
  quality TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(user_id, shared_asset_id)
);

CREATE TABLE IF NOT EXISTS playback_state (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  payload TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_downloads_user ON user_downloads(user_id);
CREATE INDEX IF NOT EXISTS idx_user_downloads_asset ON user_downloads(shared_asset_id);
CREATE INDEX IF NOT EXISTS idx_shared_assets_hash ON shared_audio_assets(content_hash);
CREATE INDEX IF NOT EXISTS idx_shared_assets_ref ON shared_audio_assets(ref_count);
`);

function addColumnIfMissing(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((row) => String(row.name));
  if (!columns.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

export function nowMs() {
  return Date.now();
}
