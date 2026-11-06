<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { IconX } from '@tabler/icons-vue';
import { useFocusTrap } from '../../composables/useFocusTrap';

const props = defineProps<{
    modal: boolean;
    open: boolean;
    title: string;
    closeLabel: string;
    applyLabel: string;
}>();
const emit = defineEmits<{ close: [] }>();

function onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') emit('close');
}

const sheet = ref<HTMLElement | null>(null);
const shown = computed(() => props.modal && props.open);
useFocusTrap(sheet, shown);

let previousOverflow = '';

function lock(locked: boolean): void {
    if (locked) {
        previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        document.addEventListener('keydown', onKeydown);
    } else {
        document.body.style.overflow = previousOverflow;
        document.removeEventListener('keydown', onKeydown);
    }
}

watch(shown, lock);
onBeforeUnmount(() => {
    if (shown.value) lock(false);
});
</script>

<template>
    <Teleport to="body" :disabled="!modal">
        <section
            ref="sheet"
            class="mv-filter-sheet"
            :class="{ 'mv-filter-sheet--modal': modal, 'mv-filter-sheet--open': open }"
            :role="modal ? 'dialog' : undefined"
            :aria-modal="modal ? 'true' : undefined"
            :aria-label="modal ? title : undefined"
        >
            <header v-if="modal" class="mv-filter-sheet__head">
                <h2 class="mv-filter-sheet__title">{{ title }}</h2>
                <button
                    class="mv-filter-sheet__close"
                    type="button"
                    :aria-label="closeLabel"
                    @click="emit('close')"
                >
                    <IconX :size="22" aria-hidden="true" />
                </button>
            </header>
            <div class="mv-filter-sheet__body"><slot /></div>
            <footer v-if="modal" class="mv-filter-sheet__foot">
                <button class="mv-filter-sheet__apply" type="button" @click="emit('close')">
                    {{ applyLabel }}
                </button>
            </footer>
        </section>
    </Teleport>
</template>

<style scoped>
.mv-filter-sheet--modal {
    display: none;
    position: fixed;
    inset: 0;
    z-index: var(--mv-z-modal);
    flex-direction: column;
    background: var(--el-bg-color-page);
}

.mv-filter-sheet--modal.mv-filter-sheet--open {
    display: flex;
}

.mv-filter-sheet__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px;
    background: var(--app-surface);
    border-bottom: 1px solid var(--app-nav-border-strong);
}

.mv-filter-sheet__title {
    margin: 0;
    font-size: 20px;
    font-weight: 900;
    letter-spacing: -0.03em;
}

.mv-filter-sheet__close {
    width: 40px;
    height: 40px;
    border: none;
    border-radius: 50%;
    background: transparent;
    font-size: 20px;
    color: inherit;
    cursor: pointer;
}

.mv-filter-sheet__body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 12px 16px;
}

.mv-filter-sheet__foot {
    padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
    background: var(--app-surface);
    border-top: 1px solid var(--app-nav-border-strong);
}

.mv-filter-sheet__apply {
    width: 100%;
    height: 48px;
    border: none;
    border-radius: 14px;
    background: var(--el-color-primary);
    color: var(--app-on-accent);
    font-size: 16px;
    font-weight: 800;
    cursor: pointer;
}
</style>
