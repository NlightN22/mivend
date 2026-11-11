<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { ElPopover } from 'element-plus';
import { useIsMobileViewport } from '../../composables/useIsMobileViewport';

const props = withDefaults(
    defineProps<{
        width?: number;
        placement?: 'bottom' | 'bottom-end' | 'bottom-start';
        sheet?: boolean;
        glass?: boolean;
    }>(),
    {
        width: 260,
        placement: 'bottom-end',
        sheet: true,
        glass: false,
    },
);
const open = defineModel<boolean>('open', { default: false });
const isMobile = useIsMobileViewport(640);
const asSheet = computed(() => isMobile.value && props.sheet);
// A card on a phone keeps 16px gutters and dims the page behind it.
const cardWidth = computed(() =>
    isMobile.value ? Math.min(props.width, window.innerWidth - 32) : props.width,
);
const cardOptions = { modifiers: [{ name: 'preventOverflow', options: { padding: 16 } }] };

// Focus stays on the trigger outside the teleported content, so Escape is caught on the document.
const closeOnEscape = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') open.value = false;
};
const content = ref<HTMLElement | null>(null);
let opener: HTMLElement | null = null;
watch(open, async isOpen => {
    if (isOpen) {
        opener = document.activeElement as HTMLElement | null;
        document.addEventListener('keydown', closeOnEscape);
        await nextTick();
        content.value?.querySelector<HTMLElement>('[data-popover-autofocus]')?.focus();
    } else {
        document.removeEventListener('keydown', closeOnEscape);
        const active = document.activeElement;
        const focusLost = !active || active === document.body || content.value?.contains(active);
        if (focusLost) opener?.focus();
        opener = null;
    }
});
onBeforeUnmount(() => document.removeEventListener('keydown', closeOnEscape));
</script>

<template>
    <template v-if="asSheet">
        <span class="mv-popover__ref" @click="open = !open"><slot name="trigger" /></span>
        <Teleport to="body">
            <div v-if="open" class="mv-popover__backdrop" @click="open = false" />
            <div v-if="open" class="mv-popover__sheet" role="dialog">
                <div ref="content" class="mv-popover__content"><slot /></div>
            </div>
        </Teleport>
    </template>
    <Teleport v-if="isMobile && !sheet" to="body">
        <div v-if="open" class="mv-popover__backdrop" @click="open = false" />
    </Teleport>
    <ElPopover
        v-if="!asSheet"
        v-model:visible="open"
        trigger="click"
        :width="cardWidth"
        :placement="placement"
        :popper-options="cardOptions"
        :popper-class="
            glass ? 'mv-popover__popper mv-popover__popper--glass' : 'mv-popover__popper'
        "
    >
        <template #reference><slot name="trigger" /></template>
        <div ref="content" class="mv-popover__content"><slot /></div>
    </ElPopover>
</template>

<style scoped>
.mv-popover__content {
    display: flex;
    flex-direction: column;
    gap: 10px;
    font-size: 13px;
    color: var(--app-text-body2);
}

.mv-popover__ref {
    display: contents;
}

.mv-popover__backdrop {
    position: fixed;
    inset: 0;
    z-index: var(--mv-z-popover);
    background: var(--app-ink-10);
}

.mv-popover__sheet {
    position: fixed;
    inset: auto 0 0 0;
    z-index: calc(var(--mv-z-popover) + 1);
    max-height: 80vh;
    overflow-y: auto;
    padding: 16px 16px calc(16px + env(safe-area-inset-bottom));
    background: var(--app-surface);
    border: 1px solid var(--app-nav-border-strong);
    border-radius: 16px 16px 0 0;
    box-shadow: 0 -8px 24px var(--app-ink-14);
}
</style>

<style>
.mv-popover__popper {
    --el-bg-color-overlay: var(--app-surface);
    border: 1px solid var(--app-nav-border-strong) !important;
    border-radius: 12px !important;
    box-shadow: 0 8px 24px var(--app-ink-14) !important;
}

.mv-popover__popper--glass {
    --el-bg-color-overlay: var(--app-glass-strong);
    /* !important: the popper's own shadow above is !important too, this one has to replace it. */
    box-shadow:
        inset 0 1px 0 var(--app-glass-edge),
        0 12px 32px var(--app-ink-14) !important;
}

@supports (backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)) {
    .mv-popover__popper--glass {
        --el-bg-color-overlay: var(--app-glass-liquid);
        -webkit-backdrop-filter: var(--mv-glass-liquid-filter);
        backdrop-filter: var(--mv-glass-liquid-filter);
    }
}

@media (prefers-reduced-transparency: reduce) {
    .mv-popover__popper--glass {
        --el-bg-color-overlay: var(--app-glass-strong);
        -webkit-backdrop-filter: none;
        backdrop-filter: none;
    }
}
</style>
