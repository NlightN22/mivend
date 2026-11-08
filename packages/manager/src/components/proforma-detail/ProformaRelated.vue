<script setup lang="ts">
import { MvPanel, formatDocumentNumber } from '@mivend/ui-kit';
import type { ProformaCard } from '../../api/proformaInvoiceCard';

defineProps<{ card: ProformaCard }>();
</script>

<template>
    <MvPanel
        v-if="card.order || card.salesInvoiceNumber"
        title="Related"
        data-testid="proforma-related"
    >
        <dl class="pf-related">
            <div v-if="card.order">
                <dt>Order</dt>
                <dd>
                    <RouterLink :to="`/orders/${card.order.code}`">
                        {{ formatDocumentNumber(card.order.code) }}
                    </RouterLink>
                </dd>
            </div>
            <div v-if="card.salesInvoiceNumber">
                <dt>ERP sales invoice</dt>
                <dd data-testid="proforma-sales-invoice">№ {{ card.salesInvoiceNumber }}</dd>
            </div>
        </dl>
    </MvPanel>
</template>

<style scoped>
.pf-related {
    display: grid;
    gap: 8px;
    margin: 0;
}

.pf-related dt {
    color: var(--app-text-grey);
    font-size: 11px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.06em;
}

.pf-related dd {
    margin: 0;
    font-weight: 700;
}

.pf-related a {
    color: var(--el-color-primary-dark-2);
    text-decoration: none;
}
</style>
