<script setup lang="ts">
import { ElPopover } from 'element-plus';
import { useIsMobileViewport } from '../../composables/useIsMobileViewport';

withDefaults(
    defineProps<{ width?: number; placement?: 'bottom' | 'bottom-end' | 'bottom-start' }>(),
    {
        width: 260,
        placement: 'bottom-end',
    },
);
const open = defineModel<boolean>('open', { default: false });
const isMobile = useIsMobileViewport(640);
</script>

<template>
    <template v-if="isMobile">
        <span class="mv-popover__ref" @click="open = !open"><slot name="trigger" /></span>
        <Teleport to="body">
            <div v-if="open" class="mv-popover__backdrop" @click="open = false" />
            <div v-if="open" class="mv-popover__sheet" role="dialog">
                <div class="mv-popover__content"><slot /></div>
            </div>
        </Teleport>
    </template>
    <ElPopover
        v-else
        v-model:visible="open"
        trigger="click"
        :width="width"
        :placement="placement"
        popper-class="mv-popover__popper"
    >
        <template #reference><slot name="trigger" /></template>
        <div class="mv-popover__content"><slot /></div>
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
</style>
