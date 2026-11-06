<script setup lang="ts">
interface Props {
    padding?: string;
    shadow?: boolean;
}

withDefaults(defineProps<Props>(), {
    padding: '20px',
    shadow: true,
});
</script>

<template>
    <div class="mv-card" :class="{ 'mv-card--shadow': shadow }" :style="{ padding: padding }">
        <slot />
    </div>
</template>

<style scoped>
.mv-card {
    background: var(--app-surface);
    border-radius: 20px;
    border: 1px solid var(--app-border-glass);
}

.mv-card--shadow {
    box-shadow: 0 14px 36px var(--app-ink-08);
}
</style>
