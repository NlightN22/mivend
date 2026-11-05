<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue';

const props = defineProps<{ open: boolean; closeLabel?: string }>();
const emit = defineEmits<{ close: [] }>();

function onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && props.open) emit('close');
}

onMounted(() => document.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown));
</script>

<template>
    <Teleport to="body">
        <div v-if="open" class="mv-account-sheet-backdrop" @click="emit('close')" />
        <section
            v-if="open"
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
</style>

<style scoped>
@media (max-width: 1180px) {
    .mv-account-sheet-backdrop,
    .mv-account-sheet {
        display: block;
    }
}
</style>
