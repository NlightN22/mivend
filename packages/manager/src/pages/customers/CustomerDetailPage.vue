<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { MvPanel, MvStatusBadge } from '@mivend/ui-kit';
import {
    fetchCustomerById,
    fetchCreditByCounterpartyId,
    fetchCustomerIdForCounterparty,
    fetchOrdersForCustomer,
    fetchDiscountRulesForPriceType,
    fetchDocumentsForCounterparty,
    type CustomerListItem,
    type CustomerCredit,
    type CustomerOrderItem,
    type DiscountRuleItem,
    type CustomerDocument,
} from '../../api/customers';
import { fetchManagerOptions, type ManagerOption } from '../../api/orders';
import CustomerOverviewTab from '../../components/customers/CustomerOverviewTab.vue';
import CustomerOrdersTab from '../../components/customers/CustomerOrdersTab.vue';
import CustomerDiscountsTab from '../../components/customers/CustomerDiscountsTab.vue';
import CustomerDocumentsTab from '../../components/customers/CustomerDocumentsTab.vue';

const route = useRoute();

const customer = ref<CustomerListItem | null>(null);
const credit = ref<CustomerCredit | null>(null);
const managers = ref<ManagerOption[]>([]);
const orders = ref<CustomerOrderItem[]>([]);
const discounts = ref<DiscountRuleItem[]>([]);
const documents = ref<CustomerDocument[]>([]);
const loading = ref(true);
const notFound = ref(false);

const activeTab = ref<'overview' | 'orders' | 'discounts' | 'documents'>('overview');

async function load(): Promise<void> {
    loading.value = true;
    notFound.value = false;
    try {
        const counterpartyId = route.params.id as string;
        const [detail, creditMap, managerOptions] = await Promise.all([
            fetchCustomerById(counterpartyId),
            fetchCreditByCounterpartyId(),
            managers.value.length ? Promise.resolve(managers.value) : fetchManagerOptions(),
        ]);
        managers.value = managerOptions;
        if (!detail) {
            notFound.value = true;
            return;
        }
        customer.value = detail;
        credit.value = creditMap.get(counterpartyId) ?? null;

        const [customerId, discountRules, docs] = await Promise.all([
            fetchCustomerIdForCounterparty(counterpartyId),
            fetchDiscountRulesForPriceType(detail.priceType),
            fetchDocumentsForCounterparty(counterpartyId),
        ]);
        discounts.value = discountRules;
        documents.value = docs;
        orders.value = customerId ? await fetchOrdersForCustomer(customerId) : [];
    } finally {
        loading.value = false;
    }
}

onMounted(load);
watch(() => route.params.id, load);

function managerName(id: string | null): string | null {
    if (!id) return null;
    return managers.value.find(m => m.id === id)?.name ?? null;
}
</script>

<template>
    <div v-if="notFound" class="customer-detail__not-found">
        <h1>Customer not found</h1>
        <RouterLink to="/customers">Back to customers</RouterLink>
    </div>

    <div v-else-if="customer" class="customer-detail">
        <div class="customer-detail__breadcrumb">
            <RouterLink to="/customers">Customers</RouterLink> / {{ customer.shortName }}
        </div>
        <h1 class="customer-detail__title">
            {{ customer.shortName }}
            <MvStatusBadge :variant="customer.isActive ? 'success' : 'neutral'">
                {{ customer.isActive ? 'Active' : 'Inactive' }}
            </MvStatusBadge>
        </h1>
        <p class="customer-detail__subtitle">
            <span v-if="customer.inn">INN {{ customer.inn }} · </span>
            <span v-if="managerName(customer.assignedManagerId)">
                Manager: {{ managerName(customer.assignedManagerId) }}
            </span>
            <span v-else>No manager assigned</span>
        </p>

        <div class="customer-detail__tabs">
            <button type="button" :class="{ active: activeTab === 'overview' }" @click="activeTab = 'overview'">
                Overview
            </button>
            <button type="button" :class="{ active: activeTab === 'orders' }" @click="activeTab = 'orders'">
                Orders
            </button>
            <button type="button" :class="{ active: activeTab === 'discounts' }" @click="activeTab = 'discounts'">
                Discounts
            </button>
            <button type="button" :class="{ active: activeTab === 'documents' }" @click="activeTab = 'documents'">
                Documents
            </button>
        </div>

        <MvPanel v-if="!loading">
            <CustomerOverviewTab v-if="activeTab === 'overview'" :customer="customer" :credit="credit" />
            <CustomerOrdersTab v-else-if="activeTab === 'orders'" :orders="orders" />
            <CustomerDiscountsTab v-else-if="activeTab === 'discounts'" :discounts="discounts" />
            <CustomerDocumentsTab v-else :documents="documents" />
        </MvPanel>
    </div>
</template>

<style scoped>
.customer-detail {
    display: flex;
    flex-direction: column;
    gap: 14px;
    max-width: 900px;
}

.customer-detail__breadcrumb {
    color: var(--el-text-color-secondary, #6b7280);
    font-size: 13px;
}

.customer-detail__breadcrumb a {
    color: inherit;
    text-decoration: none;
}

.customer-detail__title {
    margin: 0;
    font-size: 28px;
    letter-spacing: -0.03em;
    display: flex;
    align-items: center;
    gap: 12px;
}

.customer-detail__subtitle {
    margin: 0;
    color: var(--el-text-color-secondary, #6b7280);
    font-size: 13px;
}

.customer-detail__tabs {
    display: flex;
    gap: 8px;
    border-bottom: 1px solid var(--el-border-color, #e4e7ec);
    margin-top: 8px;
}

.customer-detail__tabs button {
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    padding: 10px 4px;
    font-size: 14px;
    font-weight: 700;
    color: var(--el-text-color-secondary, #6b7280);
    cursor: pointer;
}

.customer-detail__tabs button.active {
    color: var(--el-color-primary-dark-2, #008a70);
    border-bottom-color: var(--el-color-primary, #00b894);
}

.customer-detail__not-found {
    padding: 60px 0;
    text-align: center;
    color: var(--el-text-color-secondary, #6b7280);
}
</style>
