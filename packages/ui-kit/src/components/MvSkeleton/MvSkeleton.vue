<script setup lang="ts">
// Generic shimmering placeholder block — the single reusable primitive for page/panel-level
// loading states (as opposed to MvTable's own built-in spinner overlay, which covers the
// already-mounted table itself). Callers compose several of these to approximate the real
// layout's shape (see CustomerDetailPage.vue for the first usage) — this component only owns
// the shimmer look, not any specific layout.
withDefaults(
    defineProps<{
        width?: string;
        height?: string;
        radius?: string;
    }>(),
    {
        width: '100%',
        height: '16px',
        radius: '6px',
    },
);
</script>

<template>
    <div class="mv-skeleton" :style="{ width, height, borderRadius: radius }" />
</template>

<style scoped>
.mv-skeleton {
    background: linear-gradient(90deg, #eef1f4 25%, #e4e7ec 37%, #eef1f4 63%);
    background-size: 400% 100%;
    animation: mv-skeleton-shimmer 1.4s ease infinite;
}

@keyframes mv-skeleton-shimmer {
    0% { background-position: 100% 50%; }
    100% { background-position: 0 50%; }
}

@media (prefers-reduced-motion: reduce) {
    .mv-skeleton {
        animation: none;
        background: #e4e7ec;
    }
}
</style>
