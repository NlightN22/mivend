<script setup lang="ts">
import { useUiLabels } from '../../utils/uiLabels';
import { ref } from 'vue';
import { IconChevronDown, IconSearch, IconX } from '@tabler/icons-vue';
import { useAnchoredPanel } from '../../composables/useAnchoredPanel';
import { useIsMobileViewport } from '../../composables/useIsMobileViewport';
import { useSearchSelect } from './useSearchSelect';
import type { SelectOption } from './MvSelect.vue';
const uiLabel = useUiLabels();

// Single-value picker with type-to-search: a dropdown under the trigger, a bottom sheet on phones.
// Attributes (aria-label, id, data-testid) land on the trigger button, like on a native select.
defineOptions({ inheritAttrs: false });
const props = withDefaults(
    defineProps<{
        modelValue: string;
        options: SelectOption[];
        disabled?: boolean;
        title?: string;
    }>(),
    { disabled: false, title: '' },
);
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const rootEl = ref<HTMLElement | null>(null);
const panelEl = ref<HTMLElement | null>(null);
const searchEl = ref<HTMLInputElement | null>(null);
const { open, query, active, visible, selectedLabel, pick, onSearchKey } = useSearchSelect({
    options: () => props.options,
    selected: () => props.modelValue,
    pick: value => emit('update:modelValue', value),
    root: rootEl,
    panel: panelEl,
    search: searchEl,
});
const sheet = useIsMobileViewport(640);
const { style } = useAnchoredPanel({ open, anchor: () => rootEl.value, width: 320, sheet });
const listId = `mv-search-select-${Math.random().toString(36).slice(2, 9)}`;
</script>

<template>
    <div ref="rootEl" class="mv-search-select">
        <button
            type="button"
            v-bind="$attrs"
            class="mv-search-select__trigger"
            :disabled="disabled"
            :aria-expanded="open"
            aria-haspopup="listbox"
            @click="open = !open"
        >
            <span class="mv-search-select__value">{{ selectedLabel }}</span>
            <IconChevronDown :size="16" aria-hidden="true" />
        </button>
        <Teleport to="body">
            <div
                v-if="open && sheet"
                class="mv-search-select__backdrop"
                data-mv-nested
                @click="open = false"
            />
            <div
                v-if="open"
                ref="panelEl"
                class="mv-search-select__panel"
                :class="{ 'mv-search-select__panel--sheet': sheet }"
                :style="style"
                data-testid="search-select-panel"
                data-mv-nested
            >
                <header v-if="sheet" class="mv-search-select__head">
                    <h2 v-if="title" class="mv-search-select__title">{{ title }}</h2>
                    <button
                        type="button"
                        class="mv-search-select__close"
                        :aria-label="uiLabel('close', 'Close')"
                        @click="open = false"
                    >
                        <IconX :size="20" aria-hidden="true" />
                    </button>
                </header>
                <label class="mv-search-select__search">
                    <IconSearch :size="16" aria-hidden="true" />
                    <input
                        ref="searchEl"
                        v-model="query"
                        type="text"
                        role="combobox"
                        autocomplete="off"
                        aria-autocomplete="list"
                        :aria-controls="listId"
                        :aria-expanded="true"
                        :aria-activedescendant="visible.length ? `${listId}-${active}` : undefined"
                        :placeholder="uiLabel('searchPlaceholder', 'Search…')"
                        data-testid="search-select-input"
                        @keydown="onSearchKey"
                    />
                </label>
                <ul
                    v-if="visible.length"
                    :id="listId"
                    class="mv-search-select__list"
                    role="listbox"
                >
                    <li
                        v-for="(option, index) in visible"
                        :id="`${listId}-${index}`"
                        :key="option.value"
                        class="mv-search-select__option"
                        :class="{
                            'mv-search-select__option--active': index === active,
                            'mv-search-select__option--selected': option.value === modelValue,
                        }"
                        role="option"
                        :aria-selected="option.value === modelValue"
                        data-testid="search-select-option"
                        @mousedown.prevent
                        @click="pick(option.value)"
                    >
                        {{ option.label }}
                    </li>
                </ul>
                <p v-else class="mv-search-select__empty" data-testid="search-select-empty">
                    {{ uiLabel('noResults', 'Nothing found') }}
                </p>
            </div>
        </Teleport>
    </div>
</template>

<style scoped>
.mv-search-select {
    position: relative;
    width: 100%;
}

.mv-search-select__trigger {
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    width: 100%;
    height: 40px;
    padding: 0 12px;
    border: 1px solid var(--el-border-color);
    border-radius: var(--app-radius-md, 12px);
    background: var(--el-fill-color-light);
    color: var(--el-text-color-primary);
    font-size: 14px;
    text-align: left;
    cursor: pointer;
}

.mv-search-select__trigger:focus-visible,
.mv-search-select__trigger[aria-expanded='true'] {
    outline: none;
    border-color: var(--el-color-primary-light-7);
    box-shadow: 0 0 0 4px var(--el-color-primary-light-9);
    background: var(--app-surface);
}

.mv-search-select__trigger:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}

.mv-search-select__value {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.mv-search-select__backdrop {
    position: fixed;
    inset: 0;
    z-index: var(--mv-z-popover);
    background: var(--app-ink-10);
}

.mv-search-select__panel {
    position: fixed;
    z-index: calc(var(--mv-z-popover) + 2);
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px;
    background: var(--app-surface);
    border: 1px solid var(--el-border-color);
    border-radius: 10px;
    box-shadow: 0 10px 30px var(--app-ink-10);
}

.mv-search-select__panel--sheet {
    inset: auto 0 0 0;
    max-height: 80vh;
    padding: 16px 16px calc(16px + env(safe-area-inset-bottom));
    border-radius: 16px 16px 0 0;
}

.mv-search-select__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
}

.mv-search-select__title {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    color: var(--app-nav-text-strong);
}

.mv-search-select__close {
    display: flex;
    margin-left: auto;
    border: 0;
    background: none;
    color: var(--el-text-color-secondary);
    cursor: pointer;
}

.mv-search-select__search {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 36px;
    padding: 0 10px;
    border: 1px solid var(--el-border-color);
    border-radius: 8px;
    color: var(--el-text-color-secondary);
}

.mv-search-select__search:focus-within {
    border-color: var(--el-color-primary);
}

.mv-search-select__search input {
    flex: 1;
    min-width: 0;
    border: 0;
    outline: none;
    background: transparent;
    font-size: 14px;
    color: var(--el-text-color-primary);
}

.mv-search-select__list {
    margin: 0;
    padding: 0;
    max-height: 240px;
    overflow-y: auto;
    list-style: none;
}

.mv-search-select__panel--sheet .mv-search-select__list {
    max-height: 50vh;
}

.mv-search-select__option {
    padding: 8px 10px;
    border-radius: 8px;
    font-size: 14px;
    color: var(--el-text-color-primary);
    cursor: pointer;
    overflow-wrap: anywhere;
}

.mv-search-select__option--active,
.mv-search-select__option:hover {
    background: var(--el-color-primary-light-9);
}

.mv-search-select__option--selected {
    font-weight: 600;
}

.mv-search-select__empty {
    margin: 0;
    padding: 8px 10px;
    font-size: 13px;
    color: var(--el-text-color-secondary);
}
</style>
