<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '../../stores/auth';
import ExchangeListTable from '../../components/exchange-health/ExchangeListTable.vue';
import ExchangePageShell from '../../components/exchange-health/ExchangePageShell.vue';
import { outboxConfig } from '../../components/exchange-health/lists';

const { t } = useI18n();
const administratorId = useAuthStore().administrator?.id ?? 'anonymous';
const config = outboxConfig();
</script>

<template>
    <ExchangePageShell
        :title="t('exchangeHealth.lists.outbox.title')"
        :intro="t('exchangeHealth.lists.outbox.intro')"
    >
        <ExchangeListTable :config="config" :administrator-id="administratorId" />
    </ExchangePageShell>
</template>
