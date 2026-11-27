<script setup lang="ts">
import { useI18n } from 'vue-i18n';

defineProps<{ capped: boolean; count: number }>();
const { t } = useI18n();
</script>

<template>
    <small v-if="capped" class="exchange-list__capped" data-testid="exchange-capped-note">{{
        t('exchangeHealth.common.cappedTotal', { count })
    }}</small>
</template>

<style scoped>
.exchange-list__capped {
    display: block;
    color: var(--el-text-color-secondary);
}
</style>
