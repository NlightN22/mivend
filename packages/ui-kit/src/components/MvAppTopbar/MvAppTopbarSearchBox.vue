<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { IconSearch } from '@tabler/icons-vue';

defineProps<{ placeholder: string; activeId?: string }>();
const query = defineModel<string>('query', { default: '' });
const emit = defineEmits<{ keydown: [event: KeyboardEvent] }>();

const root = ref<HTMLElement | null>(null);
const field = ref<HTMLInputElement | null>(null);
const open = ref(false);

function close(): void {
    open.value = false;
}

function onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
        close();
        return;
    }
    open.value = true;
    emit('keydown', event);
    if (event.key === 'Enter' && event.defaultPrevented) close();
}

function onOutside(event: PointerEvent): void {
    if (!root.value?.contains(event.target as Node)) close();
}

onMounted(() => document.addEventListener('pointerdown', onOutside));
onBeforeUnmount(() => document.removeEventListener('pointerdown', onOutside));
defineExpose({ focus: () => field.value?.focus() });
</script>

<template>
    <div ref="root" class="search-box">
        <IconSearch :size="18" aria-hidden="true" class="search-box__icon" />
        <input
            ref="field"
            v-model="query"
            class="search-box__input"
            type="search"
            role="combobox"
            aria-controls="mv-search-results"
            aria-autocomplete="list"
            autocomplete="off"
            :aria-expanded="open"
            :aria-activedescendant="activeId"
            :placeholder="placeholder"
            :aria-label="placeholder"
            @focus="open = true"
            @input="open = true"
            @keydown="onKeydown"
        />
        <span class="search-box__shortcut" aria-hidden="true">Ctrl K</span>
        <div
            v-if="open && $slots.default"
            id="mv-search-results"
            class="search-box__dropdown mv-glass-liquid"
        >
            <slot :close="close" />
        </div>
    </div>
</template>

<style scoped>
.search-box {
    flex: 1;
    max-width: 640px;
    position: relative;
}

.search-box__icon {
    position: absolute;
    top: 11px;
    left: 14px;
    color: var(--el-text-color-secondary);
}

.search-box__input {
    width: 100%;
    height: 40px;
    padding: 0 70px 0 40px;
    border: 1px solid var(--el-border-color);
    border-radius: 999px;
    background: var(--el-fill-color-light);
    color: var(--el-text-color-primary);
    font-size: 14px;
    outline: none;
}

.search-box__input:focus-visible {
    border-color: var(--el-color-primary);
}

.search-box__input::placeholder {
    color: var(--el-text-color-secondary);
}

.search-box__shortcut {
    position: absolute;
    right: 10px;
    top: 7px;
    padding: 3px 7px;
    border: 1px solid var(--el-border-color);
    border-radius: 8px;
    color: var(--el-text-color-secondary);
    background: var(--app-surface);
    font-size: 12px;
}

.search-box__dropdown {
    position: absolute;
    top: calc(100% + 8px);
    left: 0;
    right: 0;
    z-index: var(--mv-z-dropdown);
    max-height: min(70vh, 560px);
    overflow-y: auto;
    border: 1px solid var(--app-nav-border-strong);
    border-radius: 12px;
    box-shadow:
        inset 0 1px 0 var(--app-glass-edge),
        0 12px 32px var(--app-ink-14);
}
</style>
