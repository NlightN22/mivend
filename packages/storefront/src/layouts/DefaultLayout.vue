<script setup lang="ts">
import AppHeader from '../components/AppHeader.vue';
</script>

<template>
    <div class="default-layout">
        <AppHeader />
        <RouterView />
    </div>
</template>

<style scoped>
.default-layout {
    min-height: 100vh;
    background: var(--app-color-page, #f6f8fb);
}

@media (max-width: 1180px) {
    .default-layout {
        padding-bottom: var(--mv-bottom-bar-height);
    }
}
</style>
