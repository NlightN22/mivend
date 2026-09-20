<script setup lang="ts">
import { computed } from 'vue';

// Initials-on-a-colored-circle person avatar — was hand-duplicated per call site (MvAppTopbar,
// MvAppMobileMoreSheet, CustomerDetailPage's manager slots) before this extraction, each with its
// own initials logic/styling. Single source of truth per the frontend-rules skill's ui-kit-first
// policy.
export type AvatarSize = 'sm' | 'md' | 'lg';

const props = withDefaults(
    defineProps<{
        name?: string | null;
        size?: AvatarSize;
    }>(),
    { name: null, size: 'md' },
);

const initials = computed(() => {
    if (!props.name) return '?';
    const parts = props.name.trim().split(/\s+/);
    return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
});
</script>

<template>
    <span :class="['mv-avatar', `mv-avatar--${size}`]">{{ initials }}</span>
</template>

<style scoped>
.mv-avatar {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
    border-radius: var(--app-radius-md, 12px);
    background: #eafbf7;
    color: #087965;
    border: 1px solid #c8f1e7;
    font-weight: 800;
    font-family: var(--app-font-family, Inter, system-ui, sans-serif);
    line-height: 1;
}

.mv-avatar--sm { width: 28px; height: 28px; font-size: 11px; border-radius: 50%; }
.mv-avatar--md { width: 46px; height: 46px; font-size: 15px; }
.mv-avatar--lg { width: 58px; height: 58px; font-size: 18px; }
</style>
