<script setup lang="ts">
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';

const route = useRoute();
const { t } = useI18n();
</script>

<template>
    <div class="coming-soon">
        <h1>{{ t(String(route.meta.titleKey ?? 'shell.comingSoon.title')) }}</h1>
        <p>{{ t('shell.comingSoon.text') }}</p>
    </div>
</template>

<style scoped>
.coming-soon {
    padding: 40px 0;
    color: var(--el-text-color-secondary);
}

.coming-soon h1 {
    color: var(--el-text-color-primary);
    font-size: 22px;
    margin: 0 0 8px;
}
</style>
