<script setup lang="ts">
defineProps<{ title: string }>();
</script>

<template>
    <div class="pic">
        <h2 class="pic-title">{{ title }}</h2>
        <slot />
    </div>
</template>

<style scoped>
.pic {
    background: var(--app-surface);
    border: 1px solid var(--app-nav-border);
    border-radius: 20px;
    padding: 18px 20px;
}
.pic-title {
    margin: 0 0 14px;
    font-size: 16px;
    font-weight: 950;
    letter-spacing: -0.03em;
}
</style>
