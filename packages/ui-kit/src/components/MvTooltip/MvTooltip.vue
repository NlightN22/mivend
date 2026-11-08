<script setup lang="ts">
import { ElTooltip } from 'element-plus';

interface Props {
    placement?: 'top' | 'bottom' | 'left' | 'right';
    trigger?: 'click' | 'hover';
    disabled?: boolean;
}

withDefaults(defineProps<Props>(), {
    placement: 'bottom',
    trigger: 'click',
    disabled: false,
});
</script>

<template>
    <ElTooltip
        :placement="placement"
        effect="light"
        :trigger="trigger"
        :disabled="disabled"
        popper-class="mv-tooltip__popper"
    >
        <template #content>
            <div class="mv-tooltip__content">
                <slot />
            </div>
        </template>
        <slot name="trigger" />
    </ElTooltip>
</template>

<style>
.mv-tooltip__popper {
    --el-bg-color-overlay: var(--app-surface);
    box-shadow: 0 8px 24px var(--app-ink-14) !important;
    border: 1px solid var(--app-nav-border-strong) !important;
    border-radius: 12px !important;
    max-width: 260px;
}
</style>

<style scoped>
.mv-tooltip__content {
    font-size: 13px;
    color: var(--app-text-body2);
    line-height: 1.5;
}
</style>
