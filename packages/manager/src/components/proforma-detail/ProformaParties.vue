<script setup lang="ts">
import { toRef } from 'vue';
import type { ProformaCard } from '../../api/proformaInvoiceCard';
import { useCustomerKpiData } from '../../composables/useCustomerKpiData';
import OrderCustomerSummary from '../order-detail/OrderCustomerSummary.vue';

const props = defineProps<{ card: ProformaCard }>();
const kpiData = useCustomerKpiData(toRef(() => props.card.counterpartyId));
</script>

<template>
    <section class="pf-parties" data-testid="proforma-parties">
        <div class="pf-parties__row">
            <div class="pf-parties__party">
                <span class="pf-parties__label">Customer</span>
                <RouterLink
                    :to="`/customers/${card.counterpartyId}`"
                    class="pf-parties__name"
                    data-testid="proforma-customer-link"
                >
                    {{ card.counterpartyShortName ?? `Customer ${card.counterpartyId}` }}
                </RouterLink>
            </div>
            <div class="pf-parties__party">
                <span class="pf-parties__label">Seller</span>
                <strong class="pf-parties__name">{{ card.seller?.legalName ?? '—' }}</strong>
                <span v-if="card.seller?.inn" class="pf-parties__ids">
                    INN {{ card.seller.inn
                    }}<template v-if="card.seller.kpp"> / KPP {{ card.seller.kpp }}</template>
                </span>
            </div>
        </div>
        <OrderCustomerSummary
            v-if="kpiData.loaded.value"
            :orders="kpiData.orders.value"
            :credit="null"
            :outstanding="kpiData.outstanding.value"
            :overdue="kpiData.overdue.value"
        />
    </section>
</template>

<style scoped>
.pf-parties {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.pf-parties__row {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 10px 24px;
}

.pf-parties__party {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
}

.pf-parties__label {
    color: var(--app-text-grey);
    font-size: 11px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.06em;
}

.pf-parties__name {
    font-size: 15px;
    font-weight: 800;
    color: var(--el-text-color-primary);
    text-decoration: none;
}

a.pf-parties__name {
    color: var(--el-color-primary-dark-2);
}

.pf-parties__ids {
    color: var(--app-text-grey);
    font-size: 12px;
}
</style>
