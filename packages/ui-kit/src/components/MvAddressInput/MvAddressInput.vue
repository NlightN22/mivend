<script setup lang="ts">
import { ref } from 'vue';
import MvInput from '../MvInput/MvInput.vue';
import { useDebouncedCallback } from '../../composables/useDebouncedCallback';
import { useLatestRequest } from '../../composables/useLatestRequest';

const props = defineProps<{
    modelValue: string;
    fetchSuggestions: (query: string) => Promise<string[]>;
    placeholder?: string;
    error?: boolean;
}>();
const emit = defineEmits<{ 'update:modelValue': [value: string]; blur: [] }>();

const items = ref<string[]>([]);
const open = ref(false);
const active = ref(-1);

const { run } = useLatestRequest(
    async (query: string) => {
        try {
            return await props.fetchSuggestions(query);
        } catch {
            return [];
        }
    },
    result => {
        items.value = result;
        active.value = -1;
        open.value = result.length > 0;
    },
);
const search = useDebouncedCallback((query: string) => void run(query), 300);

function onInput(value: string): void {
    emit('update:modelValue', value);
    if (value.trim().length < 3) {
        items.value = [];
        open.value = false;
        return;
    }
    search(value);
}

function pick(value: string): void {
    emit('update:modelValue', value);
    items.value = [];
    open.value = false;
}

function onKeydown(event: KeyboardEvent): void {
    if (!open.value) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const step = event.key === 'ArrowDown' ? 1 : -1;
        active.value = (active.value + step + items.value.length) % items.value.length;
    } else if (event.key === 'Enter' && active.value >= 0) {
        event.preventDefault();
        pick(items.value[active.value]);
    } else if (event.key === 'Tab' && active.value >= 0) {
        pick(items.value[active.value]);
    } else if (event.key === 'Escape') {
        open.value = false;
    }
}

function onFocusout(event: FocusEvent): void {
    if ((event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null)) return;
    open.value = false;
    emit('blur');
}
</script>

<template>
    <div class="mv-address" @focusout="onFocusout" @keydown="onKeydown">
        <MvInput
            :model-value="modelValue"
            autocomplete="off"
            :maxlength="300"
            :placeholder="placeholder"
            :error="error"
            @update:model-value="onInput"
        />
        <ul v-if="open" class="mv-address__list" role="listbox">
            <li
                v-for="(item, i) in items"
                :key="item"
                class="mv-address__item"
                :class="{ 'mv-address__item--active': i === active }"
                role="option"
                tabindex="-1"
                @mousedown.prevent="pick(item)"
            >
                {{ item }}
            </li>
        </ul>
    </div>
</template>

<style scoped>
.mv-address {
    position: relative;
}

.mv-address__list {
    position: absolute;
    z-index: var(--mv-z-dropdown);
    top: calc(100% + 4px);
    left: 0;
    right: 0;
    margin: 0;
    padding: 6px;
    list-style: none;
    background: #fff;
    border: 1px solid #e4e7ec;
    border-radius: 16px;
    box-shadow: 0 12px 32px rgba(16, 24, 40, 0.12);
}

.mv-address__item {
    padding: 10px 12px;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 600;
    color: #17212b;
    cursor: pointer;
}

.mv-address__item:hover,
.mv-address__item--active {
    background: #eefaf6;
}
</style>
