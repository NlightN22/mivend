<script setup lang="ts">
import type { GeoProviderInfo } from './types';

defineProps<{
    providers: GeoProviderInfo[];
    current: string;
    label: string;
    names?: Record<string, string>;
}>();
defineEmits<{ select: [key: string] }>();
</script>

<template>
    <div v-if="providers.length > 1" class="mv-loc-switch" role="group" :aria-label="label">
        <button
            v-for="p in providers"
            :key="p.key"
            type="button"
            class="mv-loc-switch__btn"
            :class="{ 'mv-loc-switch__btn--on': p.key === current }"
            :aria-pressed="p.key === current"
            @click="$emit('select', p.key)"
        >
            {{ names?.[p.key] ?? p.key }}
        </button>
    </div>
</template>

<style scoped>
.mv-loc-switch {
    display: inline-flex;
    padding: 3px;
    gap: 2px;
    background: var(--app-surface);
    border: 1px solid var(--el-border-color);
    border-radius: 12px;
    box-shadow: 0 4px 12px var(--app-ink-10);
}

.mv-loc-switch__btn {
    border: 0;
    padding: 6px 10px;
    border-radius: 9px;
    background: transparent;
    font: inherit;
    font-size: 13px;
    font-weight: 700;
    color: var(--app-nav-label);
    cursor: pointer;
}

.mv-loc-switch__btn--on {
    background: var(--el-color-primary);
    color: var(--app-surface);
}
</style>
