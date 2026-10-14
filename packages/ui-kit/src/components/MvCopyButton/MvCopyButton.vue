<script setup lang="ts">
import { IconCheck, IconCopy, IconLink } from '@tabler/icons-vue';
import { useCopyToClipboard } from '../../composables/useCopyToClipboard';

const props = withDefaults(
    defineProps<{ value: string | (() => string); label: string; icon?: 'copy' | 'link' }>(),
    { icon: 'copy' },
);
const { copied, copy } = useCopyToClipboard();

function onClick(): void {
    void copy(typeof props.value === 'function' ? props.value() : props.value);
}
</script>

<template>
    <button
        type="button"
        class="mv-copy-button"
        :class="{ 'mv-copy-button--done': copied }"
        :title="label"
        :aria-label="label"
        @click="onClick"
    >
        <IconCheck v-if="copied" :size="16" />
        <IconLink v-else-if="icon === 'link'" :size="16" />
        <IconCopy v-else :size="16" />
    </button>
</template>

<style scoped>
.mv-copy-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: 0;
    border-radius: var(--app-radius-sm, 8px);
    background: transparent;
    color: #66736e;
    cursor: pointer;
}
.mv-copy-button:hover {
    background: #eef4f1;
    color: #00a878;
}
.mv-copy-button--done {
    color: #00a878;
}
</style>
