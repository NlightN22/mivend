<script setup lang="ts">
defineProps<{ label: string; loading: boolean; disabled: boolean }>();
</script>

<template>
    <button class="mv-search__btn" type="button" :disabled="disabled" :aria-label="label">
        <span v-if="loading" class="mv-search__spinner" aria-hidden="true" />
        <template v-else>
            <span class="mv-search__btn-label">{{ label }}</span>
            <svg
                class="mv-search__btn-icon"
                width="20"
                height="20"
                viewBox="0 0 20 20"
                fill="none"
                aria-hidden="true"
            >
                <circle cx="9" cy="9" r="6" stroke="currentColor" stroke-width="2" />
                <path
                    d="M13.5 13.5L17 17"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                />
            </svg>
        </template>
    </button>
</template>

<style scoped>
.mv-search__btn {
    min-width: 100px;
    border: none;
    background: var(--el-color-primary);
    color: var(--app-on-accent);
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
    background: var(--app-primary-btn);
}
.mv-search__btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}

.mv-search__btn-icon {
    display: none;
}

@media (max-width: 600px) {
    .mv-search__btn {
        min-width: 52px;
        padding: 0 14px;
    }
    .mv-search__btn-label {
        display: none;
    }
    .mv-search__btn-icon {
        display: block;
    }
}

.mv-search__spinner {
    width: 18px;
    height: 18px;
    border: 2px solid var(--app-glass);
    border-top-color: var(--app-surface);
    border-radius: 50%;
    animation: mv-spin 0.6s linear infinite;
}
@keyframes mv-spin {
    to {
        transform: rotate(360deg);
    }
}
</style>
