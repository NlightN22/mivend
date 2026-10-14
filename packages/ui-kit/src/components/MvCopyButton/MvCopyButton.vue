<script setup lang="ts">
import { IconCheck, IconCopy, IconShare } from '@tabler/icons-vue';
import { useCopyToClipboard } from '../../composables/useCopyToClipboard';

const props = withDefaults(
    defineProps<{ value: string | (() => string); label: string; icon?: 'copy' | 'share' }>(),
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
        <IconCheck v-if="copied" :size="18" stroke="2" />
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
    border: 1px solid #dde7e2;
    border-radius: 10px;
    background: #fff;
    color: #344640;
    cursor: pointer;
}
.mv-copy-button:hover {
    background: #e2f8ef;
    border-color: #00a878;
    color: #008a64;
}
.mv-copy-button--done {
    border-color: #00a878;
    color: #008a64;
}
</style>
