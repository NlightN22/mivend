<script setup lang="ts">
import { IconAlertTriangle, IconCheck, IconCopy, IconShare } from '@tabler/icons-vue';
import { useCopyToClipboard } from '../../composables/useCopyToClipboard';

const props = withDefaults(
    defineProps<{ value: string | (() => string); label: string; icon?: 'copy' | 'share' }>(),
    { icon: 'copy' },
);
const { copied, failed, copy } = useCopyToClipboard();

function onClick(): void {
    void copy(typeof props.value === 'function' ? props.value() : props.value);
}
</script>

<template>
    <button
        type="button"
        class="mv-copy-button"
        :class="{ 'mv-copy-button--done': copied, 'mv-copy-button--failed': failed }"
        :title="label"
        :aria-label="label"
        @click="onClick"
    >
        <IconCheck v-if="copied" :size="18" stroke="2" />
        <IconAlertTriangle v-else-if="failed" :size="18" stroke="2" />
        <IconShare v-else-if="icon === 'share'" :size="18" stroke="2" />
        <IconCopy v-else :size="18" stroke="2" />
    </button>
</template>

<style scoped>
.mv-copy-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    padding: 0;
    border: 1px solid var(--app-nav-border-strong);
    border-radius: 10px;
    background: var(--app-surface);
    color: var(--app-text-body2);
    cursor: pointer;
}
.mv-copy-button:hover {
    background: var(--app-nav-active-bg);
    border-color: var(--el-color-primary);
    color: var(--app-nav-accent);
}
.mv-copy-button--done {
    border-color: var(--el-color-primary);
    color: var(--app-nav-accent);
}
.mv-copy-button--failed {
    border-color: var(--app-danger-btn);
    color: var(--app-danger-btn);
}
</style>
