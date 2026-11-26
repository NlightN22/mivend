<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { MvButton, MvPanel } from '@mivend/ui-kit';
import ExchangePageShell from '../../components/exchange-health/ExchangePageShell.vue';
import IntegrationExchangeSection from '../../components/exchange-health/IntegrationExchangeSection.vue';
import IntegrationInboundSection from '../../components/exchange-health/IntegrationInboundSection.vue';
import IntegrationOutboundSection from '../../components/exchange-health/IntegrationOutboundSection.vue';

const { t } = useI18n();
const refreshKey = ref(0);
</script>

<template>
    <ExchangePageShell
        :title="t('exchangeHealth.integration.title')"
        :intro="t('exchangeHealth.integration.intro')"
    >
        <template #actions>
            <MvButton variant="secondary" @click="refreshKey++">{{
                t('exchangeHealth.common.refresh')
            }}</MvButton>
        </template>
        <MvPanel :title="t('exchangeHealth.integration.inbound')">
            <div class="integration-stack">
                <IntegrationInboundSection :key="`in-${refreshKey}`" />
            </div>
        </MvPanel>
        <MvPanel :title="t('exchangeHealth.integration.outbound')">
            <div class="integration-stack">
                <IntegrationOutboundSection :key="`out-${refreshKey}`" />
            </div>
        </MvPanel>
        <MvPanel :title="t('exchangeHealth.integration.exchange')">
            <div class="integration-stack">
                <IntegrationExchangeSection :key="`ex-${refreshKey}`" />
            </div>
        </MvPanel>
    </ExchangePageShell>
</template>

<style scoped>
.integration-stack {
    display: flex;
    flex-direction: column;
    gap: 12px;
}
</style>
