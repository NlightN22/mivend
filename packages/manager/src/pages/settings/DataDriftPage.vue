<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { MvPanel } from '@mivend/ui-kit';
import { useAuthStore } from '../../stores/auth';
import ConsistencySources from '../../components/exchange-health/ConsistencySources.vue';
import ExchangeListTable from '../../components/exchange-health/ExchangeListTable.vue';
import ExchangePageShell from '../../components/exchange-health/ExchangePageShell.vue';
import { reportsConfig } from '../../components/exchange-health/lists';

const { t } = useI18n();
const administratorId = useAuthStore().administrator?.id ?? 'anonymous';
const config = reportsConfig();
</script>

<template>
    <ExchangePageShell
        :title="t('exchangeHealth.lists.reports.title')"
        :intro="t('exchangeHealth.lists.reports.intro')"
    >
        <ConsistencySources />
        <MvPanel :title="t('exchangeHealth.reports.reportsTitle')">
            <ExchangeListTable :config="config" :administrator-id="administratorId" />
        </MvPanel>
    </ExchangePageShell>
</template>
