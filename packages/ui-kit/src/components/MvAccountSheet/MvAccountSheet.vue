<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

const props = defineProps<{ open: boolean; closeLabel?: string }>();
const emit = defineEmits<{ close: [] }>();

const sheet = ref<HTMLElement | null>(null);
let opener: HTMLElement | null = null;

function focusables(): HTMLElement[] {
    return Array.from(sheet.value?.querySelectorAll<HTMLElement>('a[href], button') ?? []);
}

function onKeydown(event: KeyboardEvent): void {
    if (!props.open) return;
    if (event.key === 'Escape') {
        emit('close');
        return;
    }
    if (event.key !== 'Tab') return;
    const items = focusables();
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !sheet.value?.contains(active))) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && (active === last || !sheet.value?.contains(active))) {
        event.preventDefault();
        first.focus();
    }
}

watch(
    () => props.open,
    async isOpen => {
        if (isOpen) {
            opener = document.activeElement as HTMLElement | null;
            await nextTick();
            focusables()[0]?.focus();
        } else {
            opener?.focus();
            opener = null;
        }
    },
);

onMounted(() => document.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown));
</script>

<template>
    <Teleport to="body">
        <div v-if="open" class="mv-account-sheet-backdrop" @click="emit('close')" />
        <section
            v-if="open"
            ref="sheet"
            class="mv-account-sheet"
            role="dialog"
            aria-modal="true"
            :aria-label="closeLabel"
        >
            <div class="mv-account-sheet__handle" aria-hidden="true" />
            <slot />
        </section>
    </Teleport>
</template>

<style scoped>
.mv-account-sheet-backdrop,
.mv-account-sheet {
    display: none;
}

.mv-account-sheet-backdrop {
    position: fixed;
    inset: 0 0 var(--mv-bottom-bar-height);
    z-index: var(--mv-z-overlay);
    background: rgba(20, 35, 31, 0.28);
}

.mv-account-sheet {
    position: fixed;
    left: 0;
    right: 0;
    bottom: var(--mv-bottom-bar-height);
    z-index: calc(var(--mv-z-overlay) + 1);
    max-height: calc(100dvh - var(--mv-bottom-bar-height) - 72px);
    overflow-y: auto;
    padding: 10px 16px 12px;
    background: var(--app-surface);
    border-radius: var(--app-radius-xl) var(--app-radius-xl) 0 0;
    box-shadow: 0 -16px 40px rgba(20, 35, 31, 0.18);
}

.mv-account-sheet__handle {
    width: 42px;
    height: 4px;
    margin: 0 auto 12px;
    border-radius: 999px;
    background: var(--app-nav-border-strong);
}

@media (max-width: 1180px) {
    .mv-account-sheet-backdrop,
    .mv-account-sheet {
        display: block;
    }
}
</style>
