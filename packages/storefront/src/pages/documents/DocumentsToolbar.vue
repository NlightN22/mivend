<script setup lang="ts">
import { useI18n } from 'vue-i18n';

export interface TypeFilterOption {
    key: string;
    label: string;
}

defineProps<{ activeFilter: string; search: string; typeFilters: TypeFilterOption[] }>();
defineEmits<{
    (e: 'update:activeFilter', val: string): void;
    (e: 'update:search', val: string): void;
}>();

const { t } = useI18n();
</script>

<template>
    <div class="docs-toolbar">
        <div class="docs-toolbar__line">
            <input
                class="docs-toolbar__search"
                :placeholder="t('documents.searchPlaceholder')"
                :value="search"
                @input="$emit('update:search', ($event.target as HTMLInputElement).value)"
            />
        </div>

        <div class="docs-toolbar__chips">
            <button
                v-for="f in typeFilters"
                :key="f.key"
                class="docs-toolbar__chip"
                :class="{ 'docs-toolbar__chip--active': activeFilter === f.key }"
                @click="$emit('update:activeFilter', f.key)"
            >
                {{ f.label }}
            </button>
        </div>
    </div>
</template>

<style scoped>
.docs-toolbar {
    background: var(--app-surface);
    border: 1px solid var(--app-border-glass);
    border-radius: 28px;
    box-shadow: 0 14px 36px var(--app-ink-08);
    padding: 18px;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 12px;
}

.docs-toolbar__line {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 10px;
}

.docs-toolbar__search {
    min-height: 46px;
    border: 1px solid var(--app-nav-border-strong);
    border-radius: 16px;
    padding: 0 15px;
    outline: none;
    font: inherit;
    background: var(--app-surface);
}

.docs-toolbar__search:focus {
    border-color: var(--el-color-primary);
    box-shadow: 0 0 0 3px var(--app-green-glow);
}

.docs-toolbar__chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}

.docs-toolbar__chip {
    min-height: 34px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0 12px;
    border-radius: 999px;
    border: 1px solid var(--app-nav-border-strong);
    background: var(--app-surface);
    color: var(--app-text-body2);
    font: inherit;
    font-weight: 850;
    font-size: 13px;
    cursor: pointer;
    transition: 0.14s ease;
}

.docs-toolbar__chip--active {
    background: var(--app-brand-fill);
    border-color: var(--el-color-primary);
    color: var(--app-on-accent);
}
</style>
