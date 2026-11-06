<script setup lang="ts">
withDefaults(defineProps<{ size?: number; disabled?: boolean }>(), { size: 42, disabled: false });
defineEmits<{ click: [] }>();
</script>

<template>
    <button
        type="button"
        class="mv-round-icon-btn"
        :style="{ width: `${size}px`, height: `${size}px` }"
        :disabled="disabled"
        @click="$emit('click')"
    >
        <slot />
    </button>
</template>

<style scoped>
.mv-round-icon-btn {
    border: 1px solid var(--el-border-color);
    border-radius: 50%;
    background: var(--app-surface);
    color: var(--el-text-color-primary);
    font-size: 18px;
    line-height: 1;
    display: grid;
    place-items: center;
    cursor: pointer;
    box-shadow: 0 6px 18px var(--app-ink-10);
    transition:
        transform 0.14s ease,
        box-shadow 0.14s ease,
        opacity 0.14s ease;
}

.mv-round-icon-btn:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 10px 24px var(--app-ink-14);
}

.mv-round-icon-btn:active:not(:disabled) {
    transform: scale(0.94);
}

.mv-round-icon-btn:disabled {
    opacity: 0.4;
    cursor: default;
    box-shadow: none;
}
</style>
