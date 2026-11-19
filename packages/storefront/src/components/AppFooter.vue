<script setup lang="ts">
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
</script>

<template>
    <footer class="app-footer">
        <RouterLink to="/legal/policy" data-testid="footer-policy-link">{{
            t('legal.policy')
        }}</RouterLink>
        <RouterLink to="/legal/agreement">{{ t('legal.agreement') }}</RouterLink>
        <RouterLink to="/terms">{{ t('terms.title') }}</RouterLink>
    </footer>
</template>

<style scoped>
.app-footer {
    display: flex;
    justify-content: center;
    gap: 18px;
    flex-wrap: wrap;
    padding: 20px 16px 28px;
    font-size: 12px;
    font-weight: 700;
}

.app-footer a {
    color: var(--el-text-color-secondary);
    text-decoration: none;
}

.app-footer a:hover {
    color: var(--el-color-primary);
    text-decoration: underline;
}
</style>
