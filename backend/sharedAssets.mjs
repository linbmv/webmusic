import { createHash } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { downloadDir, db, nowMs } from "./storage.mjs";
import { randomUUID } from "node:crypto";

// 全局共享资产目录
const globalAssetsDir = join(downloadDir, "global");

// 准备 SQL 语句
const findSharedAsset = db.prepare(`
  SELECT id, file_path, size_bytes, mime_type, ref_count
  FROM shared_audio_assets
  WHERE provider_id = ? AND source = ? AND provider_song_id = ? AND quality = ?
`);

const findAssetByHash = db.prepare(`
  SELECT id, file_path, size_bytes, mime_type, ref_count
  FROM shared_audio_assets
  WHERE content_hash = ?
`);

const insertSharedAsset = db.prepare(`
  INSERT INTO shared_audio_assets
  (id, content_hash, provider_id, source, provider_song_id, quality, file_path, mime_type, size_bytes, ref_count, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
`);

const incrementRefCount = db.prepare(`
  UPDATE shared_audio_assets SET ref_count = ref_count + 1 WHERE id = ?
`);

const decrementRefCountReturning = db.prepare(`
  UPDATE shared_audio_assets SET ref_count = ref_count - 1
  WHERE id = ? AND ref_count > 0
  RETURNING id, file_path, ref_count
`);

const getAssetById = db.prepare(`
  SELECT id, file_path, size_bytes, mime_type, ref_count, content_hash
  FROM shared_audio_assets WHERE id = ?
`);

const deleteSharedAsset = db.prepare(`
  DELETE FROM shared_audio_assets WHERE id = ? AND ref_count = 0
`);

/**
 * 计算文件 SHA256 哈希
 */
export async function computeFileHash(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

/**
 * 查找或创建共享资产（事务保护）
 * @returns {id, file_path, isNew}
 */
export async function findOrCreateSharedAsset({ providerId, source, providerSongId, quality, tempFilePath, mimeType, sizeBytes }) {
  // 使用事务保护整个查找-创建-增加引用计数流程
  return db.transaction(async () => {
    // 1. 先按 provider 元信息查找（快速路径）
    let existing = findSharedAsset.get(providerId, source, providerSongId, quality);
    if (existing && existsSync(existing.file_path)) {
      incrementRefCount.run(existing.id);
      return { id: existing.id, file_path: existing.file_path, isNew: false };
    }

    // 2. 计算文件哈希（防止不同 provider 返回同一资源）
    const contentHash = await computeFileHash(tempFilePath);

    // 3. 按哈希查找去重
    existing = findAssetByHash.get(contentHash);
    if (existing && existsSync(existing.file_path)) {
      incrementRefCount.run(existing.id);
      // 修复：不创建别名记录，直接增加原记录的引用计数
      return { id: existing.id, file_path: existing.file_path, isNew: false };
    }

    // 4. 新资产，移动到全局目录
    const assetId = randomUUID();
    const ext = quality === "flac" ? "flac" : "mp3";
    const destDir = join(globalAssetsDir, providerId, source, sanitizeSegment(providerSongId));
    await mkdir(destDir, { recursive: true });
    const destPath = join(destDir, `${quality}.${ext}`);

    // 移动文件（Node.js 22+ 无 fs.rename，用 cp + rm 模拟）
    const { copyFile } = await import("node:fs/promises");
    await copyFile(tempFilePath, destPath);
    await rm(tempFilePath, { force: true });

    insertSharedAsset.run(assetId, contentHash, providerId, source, providerSongId, quality, destPath, mimeType, sizeBytes, nowMs());

    return { id: assetId, file_path: destPath, isNew: true };
  })();
}

/**
 * 减少引用计数，为0时删除文件（事务保护 + RETURNING优化）
 */
export async function removeAssetReference(sharedAssetId) {
  // 使用事务保护 decrement + 检查 + 删除的原子性
  const shouldDeleteFile = db.transaction(() => {
    const updated = decrementRefCountReturning.get(sharedAssetId);
    if (!updated) return null;

    if (updated.ref_count === 0) {
      deleteSharedAsset.run(sharedAssetId);
      return updated.file_path;
    }
    return null;
  })();

  // 文件删除放在事务外（避免阻塞数据库）
  if (shouldDeleteFile && existsSync(shouldDeleteFile)) {
    await rm(shouldDeleteFile, { force: true }).catch((err) => {
      console.warn(`Failed to delete file ${shouldDeleteFile}:`, err);
    });
    console.log(`Removed shared asset ${sharedAssetId} (ref_count=0)`);
  }
}

function sanitizeSegment(segment) {
  return String(segment).replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 200);
}
