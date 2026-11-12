<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { IconHistory, IconX } from '@tabler/icons-vue';
import type { SearchGroup, SearchHit } from '../../api/globalSearch';
import SearchResults from './SearchResults.vue';

export interface SearchShortcut {
    label: string;
    path: string;
}

export interface SearchState {
    groups: SearchGroup[];
    active: boolean;
    pending: boolean;
    failed: boolean;
    tooShort: boolean;
    empty: boolean;
}

const { t } = useI18n();
defineProps<{
    recent: string[];
    shortcuts: SearchShortcut[];
    state: SearchState;
    activeKey: string | null;
    desktop: boolean;
}>();
defineEmits<{
    run: [query: string];
    remove: [query: string];
    clear: [];
    open: [path: string];
    select: [kind: string, hit: SearchHit];
}>();
</script>

<template>
    <div class="search-panel">
        <p v-if="state.tooShort" class="search-panel__note">{{ t('shell.search.tooShort') }}</p>
        <template v-if="state.active">
            <SearchResults
                v-if="state.groups.length"
                :groups="state.groups"
                :active-key="activeKey"
                @select="(kind, hit) => $emit('select', kind, hit)"
            />
            <p v-if="state.pending" class="search-panel__note" role="status">{{ t('shell.search.pending') }}</p>
            <p v-else-if="state.failed" class="search-panel__note" role="alert">
                {{ t('shell.search.failed') }}
            </p>
            <p v-else-if="state.empty" class="search-panel__note" role="status">{{ t('shell.search.empty') }}</p>
        </template>
        <template v-else>
            <section v-if="recent.length" :aria-label="t('shell.search.recent')">
                <div class="search-panel__head">
                    <h2 class="search-panel__title">{{ t('shell.search.recent') }}</h2>
                    <button type="button" class="search-panel__clear" @click="$emit('clear')">
                        {{ t('shell.search.clear') }}
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
                        :aria-label="t('shell.search.remove', { query })"
                        @click="$emit('remove', query)"
                    >
                        <IconX :size="16" aria-hidden="true" />
                    </button>
                </div>
            </section>
            <section v-if="!desktop" :aria-label="t('shell.search.quickLinks')">
                <h2 class="search-panel__title">{{ t('shell.search.quickLinks') }}</h2>
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
        </template>
        <p
            v-if="desktop && !state.active && !recent.length && !state.tooShort"
            class="search-panel__note"
        >
            {{ t('shell.topbar.searchPlaceholder') }}
        </p>
    </div>
</template>

<style scoped>
.search-panel {
    display: flex;
    flex-direction: column;
    gap: 20px;
    padding: 16px;
}

.search-panel__note {
    margin: 0;
    color: var(--app-text-body2);
    font-size: 14px;
}

.search-panel__head,
.search-panel__row {
    display: flex;
    align-items: center;
    justify-content: space-between;
}

.search-panel__title {
    margin: 0 0 4px;
    color: var(--app-text-body2);
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
    color: var(--app-text-body2);
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
