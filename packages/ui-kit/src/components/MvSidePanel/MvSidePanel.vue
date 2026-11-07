<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue';

withDefaults(defineProps<{ title?: string; closeLabel?: string }>(), { closeLabel: 'Close' });
const emit = defineEmits<{ close: [] }>();

function onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') emit('close');
}
onMounted(() => document.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown));
</script>

<template>
    <Teleport to="body">
        <div class="mv-side-panel-overlay" @click.self="emit('close')">
            <aside class="mv-side-panel" role="dialog" aria-modal="true" :aria-label="title">
                <header class="mv-side-panel__head">
                    <span class="mv-side-panel__title">{{ title }}</span>
                    <button
                        class="mv-side-panel__close"
                        type="button"
                        :aria-label="closeLabel"
                        @click="emit('close')"
                    >
                        ✕
                    </button>
                </header>
                <div class="mv-side-panel__body">
                    <slot />
                </div>
                <footer v-if="$slots.footer" class="mv-side-panel__footer">
                    <slot name="footer" />
                </footer>
            </aside>
        </div>
    </Teleport>
</template>

<style scoped>
.mv-side-panel-overlay {
    position: fixed;
    inset: 0;
    background: var(--app-ink-14);
    display: flex;
    justify-content: flex-end;
    z-index: var(--mv-z-modal);
}

.mv-side-panel {
    background: var(--app-surface);
    box-shadow: -16px 0 48px var(--app-ink-14);
    width: 100%;
    max-width: 440px;
    height: 100%;
    display: flex;
    flex-direction: column;
}

.mv-side-panel__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 20px 20px 16px;
    border-bottom: 1px solid var(--app-nav-border);
    flex-shrink: 0;
}

.mv-side-panel__title {
    font-size: 18px;
    font-weight: 900;
    letter-spacing: -0.03em;
    color: var(--app-nav-text-strong);
}

.mv-side-panel__close {
    border: 0;
    background: var(--app-fill-soft);
    border-radius: 10px;
    width: 32px;
    height: 32px;
    font-size: 13px;
    cursor: pointer;
    color: var(--app-nav-label);
    flex-shrink: 0;
}

.mv-side-panel__close:hover {
    background: var(--app-nav-border);
    color: var(--app-nav-text-strong);
}

.mv-side-panel__body {
    flex: 1;
    overflow-y: auto;
    padding: 16px 20px 20px;
}

.mv-side-panel__footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 14px 20px;
    border-top: 1px solid var(--app-nav-border);
    flex-shrink: 0;
}

@media (max-width: 800px) {
    .mv-side-panel {
        max-width: none;
    }
}
</style>
