<script setup lang="ts">
import MvButton from '../MvButton/MvButton.vue';

defineProps<{
    title: string;
    message: string;
    retryLabel?: string;
    retrying?: boolean;
}>();

defineEmits<{ retry: [] }>();
</script>

<template>
    <div class="mv-block-error" role="alert">
        <div class="mv-block-error__text">
            <strong class="mv-block-error__title">{{ title }}</strong>
            <span class="mv-block-error__message">{{ message }}</span>
        </div>
        <MvButton
            v-if="retryLabel"
            variant="secondary"
            :disabled="retrying"
            @click="$emit('retry')"
        >
            {{ retryLabel }}
        </MvButton>
    </div>
</template>

<style scoped>
.mv-block-error {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    padding: 13px 14px;
    border-radius: 18px;
    border: 1px solid var(--app-danger-glow);
    background: var(--app-danger2-bg);
    color: var(--app-danger2-fg);
    font-size: 13px;
    line-height: 1.45;
}

.mv-block-error__text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    overflow-wrap: anywhere;
}
</style>
