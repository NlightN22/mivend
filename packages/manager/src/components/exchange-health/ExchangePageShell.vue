<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { MvNotice } from '@mivend/ui-kit';
import { useAuthStore } from '../../stores/auth';

defineProps<{ title: string; intro: string }>();
const { t } = useI18n();
const auth = useAuthStore();
const allowed =
    auth.hasPermission('ReadExchangeHealth') || auth.hasPermission('ManageErpIntegration');
</script>

<template>
    <div v-if="!allowed" class="exchange-page__denied">
        <h1>{{ t('settingsSystem.notAuthorized') }}</h1>
        <p>{{ t('exchangeHealth.common.denied') }}</p>
    </div>
    <div v-else class="exchange-page">
        <div class="exchange-page__breadcrumb">{{ t('settingsSystem.breadcrumb') }}</div>
        <div class="exchange-page__head">
            <h1 class="exchange-page__title">{{ title }}</h1>
            <slot name="actions" />
        </div>
        <MvNotice variant="info">{{ intro }}</MvNotice>
        <slot />
    </div>
</template>

<style scoped>
.exchange-page {
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-width: 0;
}

.exchange-page__denied {
    padding: 40px;
    text-align: center;
    color: var(--el-text-color-secondary);
}

.exchange-page__breadcrumb {
    color: var(--el-text-color-secondary);
    font-size: 13px;
}

.exchange-page__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
}

.exchange-page__title {
    margin: 0;
    font-size: 28px;
    letter-spacing: -0.03em;
}
</style>
