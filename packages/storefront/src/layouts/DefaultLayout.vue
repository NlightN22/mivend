<script setup lang="ts">
import { MvScrollNav } from '@mivend/ui-kit';
import AppHeader from '../components/AppHeader.vue';
</script>

<template>
    <div class="default-layout">
        <AppHeader />
        <RouterView />
        <MvScrollNav :down="false" />
    </div>
</template>

<style scoped>
.default-layout {
    min-height: 100vh;
    background: var(--el-bg-color-page);
}

@media (max-width: 1180px) {
    .default-layout {
        --mv-scroll-nav-offset: calc(var(--mv-bottom-bar-height) + 16px);
        padding-bottom: var(--mv-bottom-bar-height);
    }
}
</style>
