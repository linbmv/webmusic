<template>
  <div class="page me-page">
    <header class="page-header">
      <div>
        <h1 class="page-title">账号</h1>
        <p class="page-subtitle">登录后同步收藏、歌单、最近播放和服务端下载。</p>
      </div>
    </header>

    <section v-if="!account.user" class="account-panel">
      <div class="field-grid">
        <label>
          <span>用户名</span>
          <input v-model="username" autocomplete="username" />
        </label>
        <label>
          <span>密码</span>
          <input v-model="password" type="password" autocomplete="current-password" />
        </label>
      </div>
      <div class="button-row">
        <button class="primary-btn" :disabled="account.loading || !canSubmit" @click="signIn">登录</button>
        <button class="secondary-btn" :disabled="account.loading || !canSubmit" @click="signUp">创建账号</button>
      </div>
      <p v-if="account.error" class="error-text">{{ account.error }}</p>
    </section>

    <template v-else>
      <section class="account-panel signed-in">
        <div>
          <span class="muted small-label">当前用户</span>
          <strong>{{ account.user.username }}</strong>
        </div>
        <button class="secondary-btn" @click="signOut">退出登录</button>
      </section>

      <section class="section sync-panel">
        <div class="section-head">
          <h2 class="section-title">曲库同步</h2>
          <span class="status-dot" :class="account.syncStatus">{{ statusText }}</span>
        </div>
        <p class="muted sync-copy">登录后会自动同步收藏、歌单、最近播放和歌单歌曲目录；删除操作会在多设备间生效，无需手动上传或拉取。</p>
        <p v-if="syncTimeText" class="muted sync-copy">{{ syncTimeText }}</p>
        <p v-if="account.error" class="error-text">{{ account.error }}</p>
      </section>

      <section class="section downloads-panel">
        <div class="section-head">
          <div>
            <h2 class="section-title">服务端下载</h2>
            <p class="muted size-copy">{{ account.downloads.length }} {{ zh.common.songUnit }}，{{ formatBytes(account.totalDownloadBytes) }}</p>
          </div>
          <button class="text-btn" @click="refreshDownloads">刷新</button>
        </div>
        <div class="download-list">
          <a v-for="item in account.downloads" :key="item.id" class="download-row" :href="item.streamUrl" target="_blank" rel="noopener">
            <span class="download-cover" :style="coverStyle(item.song)" />
            <span class="download-copy">
              <strong class="ellipsis">{{ item.song.name }}</strong>
              <small class="ellipsis">{{ item.song.artistText }} · {{ item.quality }} · {{ formatBytes(item.sizeBytes) }}</small>
            </span>
          </a>
          <p v-if="!account.downloads.length" class="muted empty">还没有服务端下载歌曲。</p>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { zh } from "@/i18n/zh";
import { useAccountStore } from "@/stores/accountStore";
import type { NormalizedSong } from "@/types/music";

const account = useAccountStore();
const username = ref("");
const password = ref("");
const canSubmit = computed(() => username.value.trim().length > 0 && password.value.length >= 6);
const statusText = computed(() => {
  if (account.syncStatus === "syncing") return "同步中";
  if (account.syncStatus === "synced") return "已同步";
  if (account.syncStatus === "error") return "失败";
  return "空闲";
});
const syncTimeText = computed(() => {
  if (!account.lastSyncedAt && !account.serverLibraryUpdatedAt) return "";
  const local = account.lastSyncedAt ? `本机上次同步：${formatDate(account.lastSyncedAt)}` : "本机尚未同步";
  const server = account.serverLibraryUpdatedAt ? `服务端快照：${formatDate(account.serverLibraryUpdatedAt)}` : "服务端暂无快照";
  return `${local} · ${server}`;
});

async function signIn(): Promise<void> {
  await account.signIn(username.value.trim(), password.value);
}

async function signUp(): Promise<void> {
  await account.signUp(username.value.trim(), password.value);
}

async function signOut(): Promise<void> {
  await account.signOut();
}

async function refreshDownloads(): Promise<void> {
  await account.refreshDownloads();
}

function formatDate(value: number): string {
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function coverStyle(song: NormalizedSong): Record<string, string> {
  const cover = song.coverUrl ?? song.album?.coverUrl;
  return cover ? { backgroundImage: `url(${cover})` } : {};
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`;
}
</script>

<style scoped>
.me-page {
  display: flex;
  flex-direction: column;
}

.account-panel,
.sync-panel,
.downloads-panel {
  padding: 14px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.055);
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.signed-in,
.button-row,
.download-row {
  display: flex;
  align-items: center;
}

.signed-in {
  justify-content: space-between;
  gap: 12px;
}

.signed-in strong {
  display: block;
  margin-top: 4px;
}

.field-grid {
  display: grid;
  gap: 12px;
}

label {
  display: grid;
  gap: 6px;
  color: var(--text-muted);
  font-size: 12px;
}

input {
  min-height: 40px;
  border: 1px solid var(--bg-border);
  border-radius: 9px;
  background: var(--bg-layer);
  color: var(--text);
  padding: 0 12px;
  outline: none;
}

.button-row {
  gap: 8px;
  margin-top: 12px;
}

.button-row > button {
  flex: 1;
}

.small-label,
.size-copy,
.sync-copy,
.error-text {
  font-size: 12px;
}

.error-text {
  color: var(--danger);
}

.status-dot {
  min-width: 52px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  color: var(--text-muted);
  background: rgba(255, 255, 255, 0.08);
  font-size: 12px;
}

.status-dot.synced {
  color: #30d158;
}

.status-dot.error {
  color: var(--danger);
}

.download-list {
  display: grid;
  gap: 8px;
}

.download-row {
  min-height: 54px;
  gap: 10px;
  padding: 8px;
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.045);
}

.download-cover {
  width: 38px;
  height: 38px;
  flex: 0 0 auto;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.08) center / cover;
}

.download-copy {
  min-width: 0;
  display: grid;
  gap: 3px;
}

.download-copy strong {
  font-size: 13px;
}

.download-copy small,
.empty {
  color: var(--text-muted);
  font-size: 12px;
}
</style>
