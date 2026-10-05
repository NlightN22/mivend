<script setup lang="ts">
defineProps<{ label: string }>();
defineEmits<{ remove: [] }>();
</script>

<template>
  <span class="mv-search__scope" :title="label">
    <span class="mv-search__scope-label">{{ label }}</span>
    <button class="mv-search__scope-remove" type="button" aria-label="Remove category" @click="$emit('remove')">
      ×
    </button>
  </span>
</template>

<style scoped>
.mv-search__scope {
  display: flex;
  align-items: center;
  align-self: center;
  gap: 4px;
  flex: 0 1 auto;
  min-width: 0;
  max-width: 40%;
  margin-left: 10px;
  padding: 4px 4px 4px 10px;
  border-radius: 10px;
  background: #E6F7F2;
  color: #00715A;
  font-size: 13px;
  font-weight: 700;
}
.mv-search__scope-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mv-search__scope-remove {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: inherit;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  padding: 0;
}
.mv-search__scope-remove:hover { background: rgba(0, 113, 90, 0.15); }
</style>
