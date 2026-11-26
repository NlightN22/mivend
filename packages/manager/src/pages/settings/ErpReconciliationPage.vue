<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '../../stores/auth';
import ExchangeListTable from '../../components/exchange-health/ExchangeListTable.vue';
import ExchangePageShell from '../../components/exchange-health/ExchangePageShell.vue';
import { reconciliationConfig } from '../../components/exchange-health/lists';

const { t } = useI18n();
const administratorId = useAuthStore().administrator?.id ?? 'anonymous';
const config = reconciliationConfig();
</script>

<template>
    <ExchangePageShell
        :title="t('exchangeHealth.lists.reconciliation.title')"
        :intro="t('exchangeHealth.lists.reconciliation.intro')"
    >
        <ExchangeListTable :config="config" :administrator-id="administratorId" />
    </ExchangePageShell>
</template>
