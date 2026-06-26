<script setup lang="ts">
import { highlightMatch } from '../../utils/highlight';
import type { SuggestionGroup, SuggestionItem } from './MvSearchInput.vue';

interface Props {
  groups: SuggestionGroup[];
  query: string;
}

defineProps<Props>();

const emit = defineEmits<{
  select: [item: SuggestionItem];
}>();
</script>

<template>
  <div class="mv-search-dropdown">
    <div
      v-for="group in groups"
      :key="group.type"
      class="mv-search-dropdown__group"
    >
      <div class="mv-search-dropdown__group-label">{{ group.label }}</div>
      <button
        v-for="item in group.items"
        :key="item.id"
        type="button"
        class="mv-search-dropdown__item"
        @click="emit('select', item)"
      >
        <!-- eslint-disable-next-line vue/no-v-html -->
        <span v-html="highlightMatch(item.label, query)" />
        <span v-if="item.subtitle" class="mv-search-dropdown__item-sub">{{ item.subtitle }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.mv-search-dropdown {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  background: #fff;
  border: 1px solid #E4E7EC;
  border-radius: 16px;
  box-shadow: 0 10px 28px rgba(16, 24, 40, 0.08);
  z-index: 100;
  overflow: hidden;
  max-height: 420px;
  overflow-y: auto;
}

.mv-search-dropdown__group {
  padding: 8px 0;
  border-bottom: 1px solid #F0F2F5;
}
.mv-search-dropdown__group:last-child { border-bottom: none; }

.mv-search-dropdown__group-label {
  padding: 4px 16px 6px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #667085;
}

.mv-search-dropdown__item {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 16px;
  border: none;
  background: transparent;
  text-align: left;
  font-size: 14px;
  font-family: var(--app-font-family, Inter, system-ui, sans-serif);
  color: #17212B;
  cursor: pointer;
  transition: background 0.1s;
}
.mv-search-dropdown__item:hover { background: #F0FFFA; }
.mv-search-dropdown__item :deep(mark) {
  background: transparent;
  color: #00B894;
  font-weight: 700;
}

.mv-search-dropdown__item-sub { font-size: 12px; color: #667085; white-space: nowrap; }
</style>
