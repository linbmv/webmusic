// 数据库迁移：用户级存储 → 共享资产池 + 引用计数
import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";

const dataDir = resolve(process.env.DATA_DIR ?? "./data");
const dbPath = resolve(dataDir, "webmusic.sqlite");

export function migrateToSharedAssets() {
  const db = new DatabaseSync(dbPath);

  console.log("开始迁移：用户级存储 → 共享资产池");

  // Step 1: 创建新表结构
  db.exec(`
    -- 共享资产表（无 user_id，全局唯一）
    CREATE TABLE IF NOT EXISTS shared_audio_assets (
      id TEXT PRIMARY KEY,
      content_hash TEXT NOT NULL,              -- 文件内容哈希（SHA256）
      provider_id TEXT NOT NULL,
      source TEXT NOT NULL,
      provider_song_id TEXT NOT NULL,
      quality TEXT NOT NULL,
      file_path TEXT NOT NULL,                 -- 存储在 global/ 目录
      mime_type TEXT,
      size_bytes INTEGER NOT NULL,
      ref_count INTEGER NOT NULL DEFAULT 0,    -- 引用计数
      created_at INTEGER NOT NULL,
      UNIQUE(content_hash),
      UNIQUE(provider_id, source, provider_song_id, quality)
    );

    -- 用户下载表（改为引用 shared_audio_assets）
    CREATE TABLE IF NOT EXISTS user_downloads_v2 (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      shared_asset_id TEXT NOT NULL REFERENCES shared_audio_assets(id) ON DELETE CASCADE,
      song_payload TEXT NOT NULL,
      quality TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      UNIQUE(user_id, shared_asset_id)
    );

    CREATE INDEX IF NOT EXISTS idx_user_downloads_v2_user ON user_downloads_v2(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_downloads_v2_asset ON user_downloads_v2(shared_asset_id);
    CREATE INDEX IF NOT EXISTS idx_shared_assets_hash ON shared_audio_assets(content_hash);
    CREATE INDEX IF NOT EXISTS idx_shared_assets_ref ON shared_audio_assets(ref_count);
  `);

  // Step 2: 迁移现有数据（从 audio_assets + user_downloads → shared_audio_assets + user_downloads_v2）
  console.log("迁移现有下载记录...");

  const oldAssets = db.prepare(`
    SELECT a.*, ud.user_id, ud.id as download_id, ud.song_payload, ud.quality as download_quality, ud.created_at as download_created
    FROM audio_assets a
    JOIN user_downloads ud ON ud.asset_id = a.id
  `).all();

  console.log(`找到 ${oldAssets.length} 条旧记录`);

  const insertSharedAsset = db.prepare(`
    INSERT OR IGNORE INTO shared_audio_assets
    (id, content_hash, provider_id, source, provider_song_id, quality, file_path, mime_type, size_bytes, ref_count, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
  `);

  const insertUserDownload = db.prepare(`
    INSERT OR IGNORE INTO user_downloads_v2
    (id, user_id, shared_asset_id, song_payload, quality, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const updateRefCount = db.prepare(`
    UPDATE shared_audio_assets SET ref_count = ref_count + 1 WHERE id = ?
  `);

  const assetMap = new Map(); // provider_id:source:provider_song_id:quality → shared_asset_id

  for (const old of oldAssets) {
    const key = `${old.provider_id}:${old.source}:${old.provider_song_id}:${old.quality}`;
    let sharedAssetId = assetMap.get(key);

    if (!sharedAssetId) {
      // 首次遇到此资产，创建共享资产记录
      sharedAssetId = old.id;
      const contentHash = `legacy-${old.id}`; // 旧数据无哈希，用占位符
      insertSharedAsset.run(
        sharedAssetId,
        contentHash,
        old.provider_id,
        old.source,
        old.provider_song_id,
        old.quality,
        old.file_path,
        old.mime_type,
        old.size_bytes,
        old.created_at
      );
      assetMap.set(key, sharedAssetId);
    }

    // 创建用户引用
    insertUserDownload.run(
      old.download_id,
      old.user_id,
      sharedAssetId,
      old.song_payload,
      old.download_quality,
      old.download_created
    );

    // 增加引用计数
    updateRefCount.run(sharedAssetId);
  }

  console.log(`迁移完成：${assetMap.size} 个共享资产，${oldAssets.length} 条用户引用`);

  // Step 3: 重命名旧表（保留备份）
  db.exec(`
    ALTER TABLE audio_assets RENAME TO audio_assets_backup_v1;
    ALTER TABLE user_downloads RENAME TO user_downloads_backup_v1;
    ALTER TABLE user_downloads_v2 RENAME TO user_downloads;
  `);

  console.log("✅ 迁移成功！旧表已重命名为 *_backup_v1");
  console.log("⚠️  手动验证后可删除备份表：DROP TABLE audio_assets_backup_v1; DROP TABLE user_downloads_backup_v1;");
}

// 命令行调用
if (process.argv[1] === new URL(import.meta.url).pathname) {
  migrateToSharedAssets();
}
