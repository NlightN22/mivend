<script setup lang="ts">
import ActingBanner from '../components/ActingBanner.vue';
import AppHeader from '../components/AppHeader.vue';
</script>

<template>
    <div class="default-layout">
        <ActingBanner />
        <AppHeader />
        <RouterView />
    </div>
</template>

<style scoped>
.default-layout {
    min-height: 100vh;
    background: var(--el-bg-color-page);
}

@media (max-width: 1180px) {
    .default-layout {
        padding-bottom: var(--mv-bottom-bar-height);
    }
}
</style>
