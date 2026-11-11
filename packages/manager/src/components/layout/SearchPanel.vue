<script setup lang="ts">
import { IconHistory, IconX } from '@tabler/icons-vue';

export interface SearchShortcut {
    label: string;
    path: string;
}

defineProps<{ recent: string[]; shortcuts: SearchShortcut[] }>();
defineEmits<{ run: [query: string]; remove: [query: string]; clear: []; open: [path: string] }>();
</script>

<template>
    <div class="search-panel">
        <section v-if="recent.length" aria-label="Recent queries">
            <div class="search-panel__head">
                <h2 class="search-panel__title">Recent queries</h2>
                <button type="button" class="search-panel__clear" @click="$emit('clear')">
                    Clear
                </button>
            </div>
            <div v-for="query in recent" :key="query" class="search-panel__row">
                <button type="button" class="search-panel__recent" @click="$emit('run', query)">
                    <IconHistory :size="18" aria-hidden="true" />
                    <span>{{ query }}</span>
                </button>
                <button
                    type="button"
                    class="search-panel__remove"
                    :aria-label="`Remove ${query}`"
                    @click="$emit('remove', query)"
                >
                    <IconX :size="16" aria-hidden="true" />
                </button>
            </div>
        </section>
        <section aria-label="Quick links">
            <h2 class="search-panel__title">Quick links</h2>
            <div class="search-panel__chips">
                <button
                    v-for="shortcut in shortcuts"
                    :key="`${shortcut.label}${shortcut.path}`"
                    type="button"
                    class="search-panel__chip"
                    @click="$emit('open', shortcut.path)"
                >
                    {{ shortcut.label }}
                </button>
            </div>
        </section>
    </div>
</template>

<style scoped>
.search-panel {
    display: flex;
    flex-direction: column;
    gap: 20px;
    padding: 16px;
}

.search-panel__head,
.search-panel__row {
    display: flex;
    align-items: center;
    justify-content: space-between;
}

.search-panel__title {
    margin: 0 0 4px;
    color: var(--app-text-grey);
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
}

.search-panel__clear {
    border: 0;
    background: none;
    color: var(--el-color-primary);
    font-size: 13px;
    cursor: pointer;
}

.search-panel__recent {
    display: flex;
    flex: 1;
    align-items: center;
    gap: 10px;
    min-height: 40px;
    border: 0;
    background: none;
    color: var(--el-text-color-primary);
    font-size: 15px;
    text-align: left;
    cursor: pointer;
}

.search-panel__remove {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border: 0;
    background: none;
    color: var(--app-text-grey);
    cursor: pointer;
}

.search-panel__chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 8px;
}

.search-panel__chip {
    min-height: 36px;
    padding: 0 14px;
    border: 1px solid var(--el-border-color);
    border-radius: 999px;
    background: var(--app-surface);
    color: var(--app-text-body2);
    font-size: 14px;
    cursor: pointer;
}
</style>
