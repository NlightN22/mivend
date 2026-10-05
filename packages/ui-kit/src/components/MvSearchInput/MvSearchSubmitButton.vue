<script setup lang="ts">
defineProps<{ label: string; loading: boolean; disabled: boolean }>();
</script>

<template>
    <button class="mv-search__btn" type="button" :disabled="disabled">
        <span v-if="loading" class="mv-search__spinner" aria-hidden="true" />
        <span v-else>{{ label }}</span>
    </button>
</template>

<style scoped>
.mv-search__btn {
    min-width: 100px;
    border: none;
    background: #00b894;
    color: #fff;
    font-size: 15px;
    font-weight: 700;
    font-family: var(--app-font-family, Inter, system-ui, sans-serif);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 0 20px;
    flex-shrink: 0;
    transition: background 0.15s;
}
.mv-search__btn:hover:not(:disabled) {
    background: #00a884;
}
.mv-search__btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}

.mv-search__spinner {
    width: 18px;
    height: 18px;
    border: 2px solid rgba(255, 255, 255, 0.4);
    border-top-color: #fff;
    border-radius: 50%;
    animation: mv-spin 0.6s linear infinite;
}
@keyframes mv-spin {
    to {
        transform: rotate(360deg);
    }
}
</style>
