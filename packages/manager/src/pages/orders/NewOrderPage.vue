<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { MvPanel, MvNotice, MvSelect, MvButton } from '@mivend/ui-kit';
import {
    fetchCustomerOption,
    startActingSession,
    type CustomerOption,
} from '../../api/actingSession';
import CustomerPicker from '../../components/acting/CustomerPicker.vue';

const route = useRoute();

const customer = ref<CustomerOption | null>(null);
const tradingPointId = ref('');
const starting = ref(false);
const error = ref('');

const pointOptions = computed(() => [
    { value: '', label: "Customer's default point or self-pickup" },
    ...(customer.value?.tradingPoints ?? []).map(p => ({
        value: p.id,
        label: `${p.name} — ${p.address}`,
    })),
]);

function selectCustomer(selected: CustomerOption): void {
    customer.value = selected;
    tradingPointId.value = '';
    error.value = '';
}

onMounted(async () => {
    const counterpartyId = route.query.customerId;
    if (typeof counterpartyId !== 'string' || !counterpartyId) return;
    const match = await fetchCustomerOption(counterpartyId);
    if (match?.customerId) selectCustomer(match);
});

async function openStorefront(): Promise<void> {
    if (!customer.value) return;
    // Opened before the request so the browser treats it as a click-initiated tab.
    const tab = window.open('about:blank', '_blank');
    if (tab) tab.opener = null;
    starting.value = true;
    error.value = '';
    try {
        const url = await startActingSession(
            customer.value.counterpartyId,
            tradingPointId.value || null,
        );
        if (tab) tab.location.href = url;
        else window.open(url, '_blank');
    } catch (e) {
        tab?.close();
        error.value = e instanceof Error ? e.message : 'Could not start the order';
    } finally {
        starting.value = false;
    }
}
</script>

<template>
    <div class="new-order">
        <div class="new-order__header">
            <div class="new-order__breadcrumb">Workspace / Orders / New order</div>
            <h1 class="new-order__title">New Order</h1>
        </div>

        <MvNotice v-if="error" variant="error">{{ error }}</MvNotice>

        <MvPanel title="Customer">
            <CustomerPicker @select="selectCustomer" />
        </MvPanel>

        <MvPanel v-if="customer" title="Trading point">
            <div class="new-order__field">
                <MvSelect
                    :model-value="tradingPointId"
                    :options="pointOptions"
                    @update:model-value="tradingPointId = $event"
                />
            </div>
            <p class="new-order__hint">
                The order is placed in the storefront on behalf of the customer, in a new tab.
            </p>
            <MvButton :disabled="starting" @click="openStorefront">
                {{ starting ? 'Opening…' : 'Open storefront' }}
            </MvButton>
        </MvPanel>
        <MvPanel v-else title="Trading point">
            <p class="new-order__hint">Select a customer first.</p>
        </MvPanel>
    </div>
</template>

<style scoped>
.new-order {
    display: flex;
    flex-direction: column;
    gap: 18px;
    max-width: 960px;
}

.new-order__breadcrumb {
    color: var(--el-text-color-secondary, #6b7280);
    font-size: 13px;
    margin-bottom: 6px;
}

.new-order__title {
    margin: 0;
    font-size: 28px;
    letter-spacing: -0.03em;
}

.new-order__field {
    max-width: 420px;
}

.new-order__hint {
    color: var(--el-text-color-secondary, #6b7280);
    font-size: 13px;
    margin: 8px 0 12px;
}
</style>
