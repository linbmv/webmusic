<template>
  <div class="setting-row card card-pad">
    <span>{{ label }}</span>
    <strong>{{ value }}</strong>
  </div>
</template>

<script setup lang="ts">
defineProps<{ label: string; value: string }>();
</script>

<style scoped>
.setting-row {
  min-height: 58px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.setting-row span {
  color: var(--text-muted);
}
</style>

