<script setup lang="ts">
import { ref } from 'vue';
import MvInput from '../MvInput/MvInput.vue';
import type { GeoSuggestion, LocationPickerLabels } from './types';

defineProps<{
    query: string;
    suggestions: GeoSuggestion[];
    failed: boolean;
    labels: LocationPickerLabels;
}>();
const emit = defineEmits<{
    input: [value: string];
    submit: [];
    pick: [suggestion: GeoSuggestion];
}>();

const active = ref(-1);

function onKeydown(event: KeyboardEvent, count: number): void {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        if (!count) return;
        event.preventDefault();
        active.value = (active.value + (event.key === 'ArrowDown' ? 1 : -1) + count) % count;
    } else if (event.key === 'Enter') {
        event.preventDefault();
        emit('submit');
    }
}
</script>

<template>
    <div class="mv-loc-search" role="search" @keydown="onKeydown($event, suggestions.length)">
        <MvInput
            :model-value="query"
            :placeholder="labels.searchPlaceholder"
            :aria-label="labels.searchLabel"
            autocomplete="off"
            :maxlength="300"
            @update:model-value="emit('input', $event)"
        />
        <p v-if="failed" class="mv-loc-search__note">{{ labels.searchUnavailable }}</p>
        <ul v-if="suggestions.length" class="mv-loc-search__list" role="listbox">
            <li
                v-for="(s, i) in suggestions"
                :key="`${s.address}-${i}`"
                class="mv-loc-search__item"
                :class="{ 'mv-loc-search__item--active': i === active }"
                role="option"
                tabindex="0"
                :aria-selected="i === active"
                @mousedown.prevent="emit('pick', s)"
                @keydown.enter.stop.prevent="emit('pick', s)"
                @keydown.space.stop.prevent="emit('pick', s)"
            >
                {{ s.address }}
            </li>
        </ul>
    </div>
</template>

<style scoped>
.mv-loc-search {
    position: relative;
}

.mv-loc-search__note {
    margin: 6px 4px 0;
    font-size: 12px;
    color: var(--app-nav-label);
}

.mv-loc-search__list {
    position: absolute;
    z-index: var(--mv-z-dropdown);
    top: calc(100% + 4px);
    left: 0;
    right: 0;
    max-height: 240px;
    overflow-y: auto;
    margin: 0;
    padding: 6px;
    list-style: none;
    background: var(--app-surface);
    border: 1px solid var(--el-border-color);
    border-radius: 16px;
    box-shadow: 0 12px 32px var(--app-ink-10);
}

.mv-loc-search__item {
    padding: 10px 12px;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 600;
    color: var(--app-nav-text-strong);
    cursor: pointer;
}

.mv-loc-search__item:hover,
.mv-loc-search__item:focus-visible,
.mv-loc-search__item--active {
    background: var(--app-fill-soft);
    outline: none;
}
</style>
