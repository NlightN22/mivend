<script setup lang="ts">
import { MvScrollNav } from '@mivend/ui-kit';
import { useI18n } from 'vue-i18n';
import AppHeader from '../components/AppHeader.vue';

const { t } = useI18n();
</script>

<template>
    <div class="default-layout">
        <AppHeader />
        <RouterView />
        <MvScrollNav :down="false" :up-label="t('common.scrollToTop')" />
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
