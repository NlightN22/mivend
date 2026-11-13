<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '../../stores/auth';
import type { CustomerListItem, CustomerCredit } from '../../api/customers';
import type { ManagerOption } from '../../api/orders';
import type { CounterpartyTeamMember } from '../../api/counterpartyTeam';
import type { EntityRef } from '../../api/history';
import type { CustomerDetailTab } from '../../composables/useCustomerDetailTabs';
import CustomerOverviewTab from './CustomerOverviewTab.vue';

// Only the open tab is loaded; the card shell and the not-found state stay light.
const OrdersList = defineAsyncComponent(() => import('../orders/OrdersList.vue'));
const CustomerDiscountsTab = defineAsyncComponent(() => import('./CustomerDiscountsTab.vue'));
const CustomerDocumentsTab = defineAsyncComponent(() => import('./CustomerDocumentsTab.vue'));
const ProformaInvoicesList = defineAsyncComponent(
    () => import('../proforma-invoices/ProformaInvoicesList.vue'),
);
const SettlementsList = defineAsyncComponent(() => import('../settlements/SettlementsList.vue'));
const CustomerTeamTab = defineAsyncComponent(() => import('./CustomerTeamTab.vue'));
const CustomerPortalUsersTab = defineAsyncComponent(() => import('./CustomerPortalUsersTab.vue'));
const EntityHistoryPanel = defineAsyncComponent(() => import('../history/EntityHistoryPanel.vue'));
const EntityChangeJournalTable = defineAsyncComponent(
    () => import('../change-journal/EntityChangeJournalTable.vue'),
);

const props = defineProps<{
    tab: CustomerDetailTab;
    customer: CustomerListItem;
    credit: CustomerCredit | null;
    managers: ManagerOption[];
    vendureCustomerId: string | null;
    historyRefs: EntityRef[];
}>();
const emit = defineEmits<{ changed: []; teamLoaded: [members: CounterpartyTeamMember[]] }>();

const { t } = useI18n();
const authStore = useAuthStore();

const canManageTeam = computed(() => authStore.hasPermission('ManageCounterpartyTeam'));
const canManagePortalAccess = computed(() =>
    authStore.hasPermission('ManageCounterpartyPortalAccess'),
);
const ownerName = computed(
    () => props.managers.find(m => m.id === props.customer.assignedManagerId)?.name ?? null,
);

// Only the entity types this page versions need an entry; others fall back to the raw entityName.
const historyEntityLabels = computed(() => ({
    Counterparty: t('customers.detail.entities.Counterparty'),
    TradingPoint: t('customers.detail.entities.TradingPoint'),
}));
</script>

<template>
    <CustomerOverviewTab
        v-if="tab === 'overview'"
        :customer="customer"
        :credit="credit"
        :managers="managers"
        @changed="emit('changed')"
    />
    <OrdersList
        v-else-if="tab === 'orders' && vendureCustomerId"
        :customer-id="vendureCustomerId"
        url-prefix="orders."
    />
    <p v-else-if="tab === 'orders'" class="customer-detail__no-orders">
        {{ t('customers.detail.noOrders') }}
    </p>
    <ProformaInvoicesList
        v-else-if="tab === 'proformaInvoices'"
        :counterparty-id="customer.id"
        url-prefix="proformaInvoices."
    />
    <SettlementsList
        v-else-if="tab === 'settlements'"
        :counterparty-id="customer.id"
        url-prefix="settlements."
    />
    <CustomerDiscountsTab
        v-else-if="tab === 'discounts'"
        :counterparty-id="customer.id"
        :counterparty-name="customer.shortName || customer.inn || customer.id"
    />
    <CustomerDocumentsTab v-else-if="tab === 'documents'" :counterparty-id="customer.id" />
    <CustomerTeamTab
        v-else-if="tab === 'team'"
        :counterparty-id="customer.id"
        :owner-id="customer.assignedManagerId"
        :owner-name="ownerName"
        :managers="managers"
        :can-manage="canManageTeam"
        @loaded="emit('teamLoaded', $event)"
    />
    <CustomerPortalUsersTab
        v-else-if="tab === 'portalUsers'"
        :counterparty-id="customer.id"
        :can-manage="canManagePortalAccess"
    />
    <EntityChangeJournalTable
        v-else-if="tab === 'changeJournal'"
        entity-type="Counterparty"
        :entity-id="customer.id"
        :managers="managers"
    />
    <EntityHistoryPanel
        v-else
        :refs="historyRefs"
        :managers="managers"
        :entity-labels="historyEntityLabels"
    />
</template>

<style scoped>
.customer-detail__no-orders {
    margin: 0;
    color: var(--el-text-color-secondary);
    font-size: 13px;
}
</style>
