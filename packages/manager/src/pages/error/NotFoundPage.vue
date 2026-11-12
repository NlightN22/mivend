<script setup lang="ts">
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
</script>

<template>
    <div class="not-found">
        <h1>404</h1>
        <p>{{ t('shell.notFound.text') }}</p>
        <RouterLink to="/">{{ t('shell.notFound.back') }}</RouterLink>
    </div>
</template>

<style scoped>
.not-found {
    text-align: center;
    padding: 60px 0;
    color: var(--el-text-color-secondary);
}
</style>
