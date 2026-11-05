<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { IconChevronDown, IconUser } from '@tabler/icons-vue';

const props = defineProps<{ open: boolean; label: string }>();
const emit = defineEmits<{ 'update:open': [open: boolean] }>();

const root = ref<HTMLElement | null>(null);
const trigger = ref<HTMLButtonElement | null>(null);
const panel = ref<HTMLElement | null>(null);

function onPointer(event: PointerEvent): void {
    if (!root.value?.contains(event.target as Node)) emit('update:open', false);
}

function onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return;
    emit('update:open', false);
    trigger.value?.focus();
}

watch(
    () => props.open,
    async isOpen => {
        if (isOpen) {
            document.addEventListener('pointerdown', onPointer);
            document.addEventListener('keydown', onKeydown);
            await nextTick();
            panel.value?.querySelector<HTMLElement>('a, button')?.focus();
        } else {
            document.removeEventListener('pointerdown', onPointer);
            document.removeEventListener('keydown', onKeydown);
        }
    },
);

onBeforeUnmount(() => {
    document.removeEventListener('pointerdown', onPointer);
    document.removeEventListener('keydown', onKeydown);
});
</script>

<template>
    <div ref="root" class="mv-account-dropdown">
        <button
            ref="trigger"
            type="button"
            class="mv-account-dropdown__trigger"
            :class="{ 'mv-account-dropdown__trigger--open': open }"
            aria-haspopup="true"
            :aria-expanded="open"
            @click="emit('update:open', !open)"
        >
            <IconUser :size="20" aria-hidden="true" />
            <span>{{ label }}</span>
            <IconChevronDown
                :size="16"
                class="mv-account-dropdown__chevron"
                :class="{ 'mv-account-dropdown__chevron--open': open }"
                aria-hidden="true"
            />
        </button>
        <div v-if="open" ref="panel" class="mv-account-dropdown__panel">
            <slot />
        </div>
    </div>
</template>

<style scoped>
.mv-account-dropdown {
    position: relative;
}

.mv-account-dropdown__trigger {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 44px;
    padding: 0 12px;
    border: 0;
    border-radius: var(--app-radius-md);
    background: var(--app-nav-active-bg);
    color: var(--app-nav-accent);
    font: inherit;
    font-size: 14px;
    font-weight: 800;
    white-space: nowrap;
    cursor: pointer;
    transition: background 0.14s;
}

.mv-account-dropdown__trigger:hover {
    background: var(--app-catalog-active);
}

.mv-account-dropdown__trigger:active,
.mv-account-dropdown__trigger--open {
    background: var(--app-catalog-active);
}

.mv-account-dropdown__trigger:focus-visible {
    outline: 2px solid var(--app-nav-accent);
    outline-offset: 2px;
}

.mv-account-dropdown__chevron {
    transition: transform 0.15s;
}

.mv-account-dropdown__chevron--open {
    transform: rotate(180deg);
}

.mv-account-dropdown__panel {
    position: absolute;
    top: calc(100% + 10px);
    right: 0;
    z-index: var(--mv-z-dropdown);
    width: 320px;
    max-width: calc(100vw - 32px);
    max-height: calc(100vh - 120px);
    overflow-y: auto;
    padding: 16px;
    background: var(--app-surface);
    border: 1px solid var(--app-nav-border);
    border-radius: var(--app-radius-lg);
    box-shadow: var(--app-shadow-md);
}
</style>
