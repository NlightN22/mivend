<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { MvInput, MvStatusBadge } from '@mivend/ui-kit';
import {
    fetchCustomerOptions,
    fetchCustomerCredit,
    type CustomerOption,
    type CustomerCredit,
} from '../../api/orderCreate';

const emit = defineEmits<{ select: [customer: CustomerOption] }>();

const allCustomers = ref<CustomerOption[]>([]);
const search = ref('');
const selected = ref<CustomerOption | null>(null);
const credit = ref<CustomerCredit | null>(null);
const showResults = ref(false);

onMounted(async () => {
    allCustomers.value = await fetchCustomerOptions();
});

const matches = computed(() => {
    const term = search.value.trim().toLowerCase();
    if (!term) return [];
    return allCustomers.value
        .filter(
            c =>
                c.shortName.toLowerCase().includes(term) ||
                c.legalName.toLowerCase().includes(term) ||
                (c.inn ?? '').includes(term),
        )
        .slice(0, 8);
});

async function selectCustomer(customer: CustomerOption): Promise<void> {
    selected.value = customer;
    showResults.value = false;
    search.value = '';
    credit.value = await fetchCustomerCredit(customer.counterpartyId);
    emit('select', customer);
}

function clearSelection(): void {
    selected.value = null;
    credit.value = null;
}

watch(search, () => {
    showResults.value = search.value.trim().length > 0;
});
</script>

<template>
    <div class="customer-picker">
        <div v-if="!selected" class="customer-picker__search">
            <MvInput
                size="sm"
                :model-value="search"
                placeholder="Search by company name or INN..."
                @update:model-value="search = $event"
            />
            <ul v-if="showResults" class="customer-picker__results">
                <li v-if="!matches.length" class="customer-picker__empty">No matching customers</li>
                <li
                    v-for="customer in matches"
                    :key="customer.counterpartyId"
                    class="customer-picker__result"
                    @click="selectCustomer(customer)"
                >
                    <strong>{{ customer.shortName }}</strong>
                    <span v-if="customer.inn">INN {{ customer.inn }}</span>
                </li>
            </ul>
        </div>

        <div v-else class="customer-picker__card">
            <div class="customer-picker__card-main">
                <strong>{{ selected.shortName }}</strong>
                <span v-if="selected.inn" class="customer-picker__meta">INN {{ selected.inn }}</span>
                <MvStatusBadge variant="info">{{ selected.priceType }}</MvStatusBadge>
            </div>
            <div v-if="credit" class="customer-picker__credit">
                <span>Credit limit: {{ (credit.creditLimit / 100).toLocaleString('en-US') }}</span>
                <span>Balance: {{ (credit.creditBalance / 100).toLocaleString('en-US') }}</span>
            </div>
            <button type="button" class="customer-picker__change" @click="clearSelection">
                Change customer
            </button>
        </div>
    </div>
</template>

<style scoped>
.customer-picker__search {
    position: relative;
    max-width: 420px;
}

.customer-picker__results {
    position: absolute;
    z-index: 10;
    top: 44px;
    left: 0;
    right: 0;
    background: #fff;
    border: 1px solid var(--el-border-color, #e4e7ec);
    border-radius: var(--app-radius-md, 12px);
    box-shadow: var(--app-shadow-md, 0 10px 28px rgba(16, 24, 40, 0.08));
    max-height: 260px;
    overflow-y: auto;
    list-style: none;
    margin: 0;
    padding: 4px;
}

.customer-picker__result {
    display: flex;
    justify-content: space-between;
    padding: 8px 10px;
    border-radius: 8px;
    cursor: pointer;
    font-size: 13px;
}

.customer-picker__result:hover {
    background: var(--el-fill-color-light, #f8fafc);
}

.customer-picker__empty {
    padding: 10px;
    font-size: 13px;
    color: var(--el-text-color-secondary, #6b7280);
}

.customer-picker__card {
    display: flex;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
}

.customer-picker__card-main {
    display: flex;
    align-items: center;
    gap: 10px;
}

.customer-picker__meta {
    font-size: 12px;
    color: var(--el-text-color-secondary, #6b7280);
}

.customer-picker__credit {
    display: flex;
    gap: 16px;
    font-size: 13px;
    color: var(--el-text-color-secondary, #6b7280);
}

.customer-picker__change {
    margin-left: auto;
    background: none;
    border: 1px solid var(--el-border-color, #e4e7ec);
    border-radius: 999px;
    padding: 6px 12px;
    font-size: 13px;
    cursor: pointer;
}

.customer-picker__change:hover {
    background: var(--el-fill-color-light, #f8fafc);
}
</style>
