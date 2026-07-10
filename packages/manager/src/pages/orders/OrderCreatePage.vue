<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { MvPanel, MvNotice } from '@mivend/ui-kit';
import {
    createDraftOrder,
    setCustomerForDraftOrder,
    addItemToDraftOrder,
    adjustDraftOrderLineQuantity,
    removeDraftOrderLine,
    fetchOrder,
    finalizeOrder,
    type CustomerOption,
    type DraftOrderState,
    type ProductSearchResult,
} from '../../api/orderCreate';
import CustomerPicker from '../../components/order-create/CustomerPicker.vue';
import ItemSearchBar from '../../components/order-create/ItemSearchBar.vue';
import OrderItemsTable from '../../components/order-create/OrderItemsTable.vue';
import DeliveryPaymentSection from '../../components/order-create/DeliveryPaymentSection.vue';
import OrderSummaryBar from '../../components/order-create/OrderSummaryBar.vue';

const router = useRouter();

const customer = ref<CustomerOption | null>(null);
const order = ref<DraftOrderState | null>(null);
const settingUpCustomer = ref(false);
const error = ref('');

const tradingPointId = ref('');
const paymentMethod = ref('offline-terms');
const pendingApprovalLineIds = ref(new Set<string>());
const submitting = ref(false);

const selectedTradingPoint = computed(() =>
    customer.value?.tradingPoints.find(p => p.id === tradingPointId.value),
);

async function handleCustomerSelected(selected: CustomerOption): Promise<void> {
    customer.value = selected;
    tradingPointId.value = selected.tradingPoints[0]?.id ?? '';
    settingUpCustomer.value = true;
    error.value = '';
    try {
        const draft = await createDraftOrder();
        order.value = await setCustomerForDraftOrder(draft.id, selected.customerId);
    } catch (e) {
        error.value = e instanceof Error ? e.message : 'Could not start a new order';
    } finally {
        settingUpCustomer.value = false;
    }
}

async function handleAddProduct(product: ProductSearchResult): Promise<void> {
    if (!order.value) return;
    try {
        order.value = await addItemToDraftOrder(order.value.id, product.productVariantId, 1);
    } catch (e) {
        error.value = e instanceof Error ? e.message : 'Could not add product to the order';
    }
}

async function handleUpdateQuantity(lineId: string, quantity: number): Promise<void> {
    if (!order.value || quantity < 1) return;
    order.value = await adjustDraftOrderLineQuantity(order.value.id, lineId, quantity);
}

async function handleRemoveLine(lineId: string): Promise<void> {
    if (!order.value) return;
    order.value = await removeDraftOrderLine(order.value.id, lineId);
    pendingApprovalLineIds.value.delete(lineId);
}

async function handleAdjusted(
    lineId: string,
    decision: 'apply-directly' | 'requires-approval',
): Promise<void> {
    if (!order.value) return;
    if (decision === 'requires-approval') {
        pendingApprovalLineIds.value.add(lineId);
    } else {
        pendingApprovalLineIds.value.delete(lineId);
    }
    order.value = await fetchOrder(order.value.id);
}

const hasPendingApproval = computed(() => pendingApprovalLineIds.value.size > 0);
const canPlaceOrder = computed(() => !!order.value && order.value.lines.length > 0 && !submitting.value);

async function placeOrder(): Promise<void> {
    if (!order.value) return;
    submitting.value = true;
    error.value = '';
    try {
        if (hasPendingApproval.value) {
            // At least one line is awaiting approval — the order stays a draft, nothing is
            // shipped/charged until that request is resolved (see docs/ai/manager-portal-pages/
            // 02b-order-create.md, "После сохранения").
            await router.push(`/orders/${order.value.code}`);
            return;
        }
        const result = await finalizeOrder(
            order.value.id,
            selectedTradingPoint.value?.address ?? '',
            paymentMethod.value,
        );
        await router.push(`/orders/${result.code}`);
    } catch (e) {
        error.value = e instanceof Error ? e.message : 'Could not place the order';
    } finally {
        submitting.value = false;
    }
}
</script>

<template>
    <div class="order-create">
        <div class="order-create__header">
            <div class="order-create__breadcrumb">Workspace / Orders / New order</div>
            <h1 class="order-create__title">New Order</h1>
        </div>

        <MvNotice v-if="error" variant="error" class="order-create__error">{{ error }}</MvNotice>

        <MvPanel title="Customer">
            <CustomerPicker @select="handleCustomerSelected" />
        </MvPanel>

        <MvPanel v-if="customer" title="Items" class="order-create__items-panel">
            <p v-if="settingUpCustomer" class="order-create__hint">Setting up order…</p>
            <template v-else-if="order">
                <ItemSearchBar @add="handleAddProduct" />
                <OrderItemsTable
                    :order-id="order.id"
                    :lines="order.lines"
                    :currency-code="order.currencyCode"
                    :pending-approval-line-ids="pendingApprovalLineIds"
                    @update-quantity="handleUpdateQuantity"
                    @remove="handleRemoveLine"
                    @adjusted="handleAdjusted"
                />
                <p v-if="!order.lines.length" class="order-create__hint">
                    Search for a product above to add the first line.
                </p>
            </template>
        </MvPanel>
        <MvPanel v-else title="Items">
            <p class="order-create__hint">Select a customer first.</p>
        </MvPanel>

        <MvPanel v-if="customer && order" title="Delivery & Payment">
            <DeliveryPaymentSection
                :trading-points="customer.tradingPoints"
                :trading-point-id="tradingPointId"
                :payment-method="paymentMethod"
                @update:trading-point-id="tradingPointId = $event"
                @update:payment-method="paymentMethod = $event"
            />
        </MvPanel>

        <OrderSummaryBar
            v-if="order"
            :sub-total-with-tax="order.subTotalWithTax"
            :total-with-tax="order.totalWithTax"
            :currency-code="order.currencyCode"
            :has-pending-approval="hasPendingApproval"
            :disabled="!canPlaceOrder"
            :submitting="submitting"
            @submit="placeOrder"
        />
    </div>
</template>

<style scoped>
.order-create {
    display: flex;
    flex-direction: column;
    gap: 18px;
    max-width: 960px;
}

.order-create__breadcrumb {
    color: var(--el-text-color-secondary, #6b7280);
    font-size: 13px;
    margin-bottom: 6px;
}

.order-create__title {
    margin: 0;
    font-size: 28px;
    letter-spacing: -0.03em;
}

.order-create__hint {
    color: var(--el-text-color-secondary, #6b7280);
    font-size: 13px;
    margin: 0;
}
</style>
