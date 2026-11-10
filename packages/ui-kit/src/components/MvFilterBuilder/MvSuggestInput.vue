<script setup lang="ts">
import { computed, toRef } from 'vue';
import MvInput from '../MvInput/MvInput.vue';
import { type SuggestFetcher, useSuggestions } from './useSuggestions';

// A text input that offers up to 10 server suggestions; free text always stays allowed.
const props = defineProps<{
    modelValue: string;
    suggest?: SuggestFetcher;
    placeholder?: string;
    testid?: string;
}>();
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const { items, active, query, close, onKey } = useSuggestions(toRef(props, 'suggest'));
const listId = `mv-suggest-${Math.random().toString(36).slice(2, 9)}`;
const open = computed(() => items.value.length > 0);

function onInput(text: string): void {
    emit('update:modelValue', text);
    query(text);
}
</script>

<template>
    <div class="mv-suggest">
        <MvInput
            :model-value="modelValue"
            size="sm"
            :placeholder="placeholder"
            :data-testid="testid"
            autocomplete="off"
            role="combobox"
            aria-autocomplete="list"
            :aria-expanded="open"
            :aria-controls="listId"
            :aria-activedescendant="active >= 0 ? `${listId}-${active}` : undefined"
            @update:model-value="onInput"
            @keydown="onKey($event, v => emit('update:modelValue', v))"
            @blur="close"
        />
        <ul
            v-if="open"
            :id="listId"
            class="mv-suggest__list"
            role="listbox"
            aria-label="Starting with"
        >
            <li class="mv-suggest__hint" role="presentation">Starting with</li>
            <li
                v-for="(item, index) in items"
                :id="`${listId}-${index}`"
                :key="item"
                class="mv-suggest__option"
                :class="{ 'mv-suggest__option--active': index === active }"
                role="option"
                :aria-selected="index === active"
                data-testid="filter-suggestion"
                @mousedown.prevent="
                    emit('update:modelValue', item);
                    close();
                "
            >
                {{ item }}
            </li>
        </ul>
    </div>
</template>

<style scoped>
.mv-suggest__list {
    margin: 4px 0 0;
    padding: 4px;
    max-height: 240px;
    overflow-y: auto;
    list-style: none;
    border: 1px solid var(--el-border-color);
    border-radius: 12px;
    background: var(--app-surface);
}

.mv-suggest__hint {
    padding: 2px 10px 4px;
    font-size: 11px;
    color: var(--el-text-color-secondary);
}

.mv-suggest__option {
    padding: 6px 10px;
    border-radius: 8px;
    font-size: 13px;
    color: var(--el-text-color-primary);
    cursor: pointer;
    overflow-wrap: anywhere;
}

.mv-suggest__option--active,
.mv-suggest__option:hover {
    background: var(--el-color-primary-light-9);
}
</style>
