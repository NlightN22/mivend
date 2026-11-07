<script setup lang="ts">
import { ElPopover } from 'element-plus';

withDefaults(
    defineProps<{ width?: number; placement?: 'bottom' | 'bottom-end' | 'bottom-start' }>(),
    {
        width: 260,
        placement: 'bottom-end',
    },
);
const open = defineModel<boolean>('open', { default: false });
</script>

<template>
    <ElPopover
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
</style>

<style>
.mv-popover__popper {
    --el-bg-color-overlay: var(--app-surface);
    border: 1px solid var(--app-nav-border-strong) !important;
    border-radius: 12px !important;
    box-shadow: 0 8px 24px var(--app-ink-14) !important;
}
</style>
