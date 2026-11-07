<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { MvPanel } from '@mivend/ui-kit';
import { useAuthStore } from '../../stores/auth';
import { NON_EDITABLE_ORDER_STATES } from '../../api/orderDetail';
import { isNotRegisteredInErp } from '../../composables/isNotRegisteredInErp';
import { useCustomerKpiData } from '../../composables/useCustomerKpiData';
import { useFindingConsequences } from '../../composables/useFindingConsequences';
import { useOrderChecks } from '../../composables/useOrderChecks';
import { useOrderDetail } from '../../composables/useOrderDetail';
import { useReservationActions } from '../../composables/useReservationActions';
import { summarizeFindings } from '../../utils/orderFindingsSummary';
import CustomerKpiStrip from '../../components/customers/CustomerKpiStrip.vue';
import OrderApprovalsPanel from '../../components/order-detail/OrderApprovalsPanel.vue';
import OrderContextPanel from '../../components/order-detail/OrderContextPanel.vue';
import OrderContractPanel from '../../components/order-detail/OrderContractPanel.vue';
import OrderDeliveryPanel from '../../components/order-detail/OrderDeliveryPanel.vue';
import OrderErpRegistration from '../../components/order-detail/OrderErpRegistration.vue';
import OrderErpStatusPanels from '../../components/order-detail/OrderErpStatusPanels.vue';
import OrderFindingsPanel from '../../components/order-detail/OrderFindingsPanel.vue';
import OrderFindingsStrip from '../../components/order-detail/OrderFindingsStrip.vue';
import OrderHeader from '../../components/order-detail/OrderHeader.vue';
import OrderLinesTable from '../../components/order-detail/OrderLinesTable.vue';
import OrderLinesTotals from '../../components/order-detail/OrderLinesTotals.vue';
import OrderShortfallPanel from '../../components/order-detail/OrderShortfallPanel.vue';
import PaymentReceivedPanel from '../../components/order-detail/PaymentReceivedPanel.vue';
import ProformaInvoicesPanel from '../../components/order-detail/ProformaInvoicesPanel.vue';
import RelatedDocumentsPanel from '../../components/order-detail/RelatedDocumentsPanel.vue';
import ReservationHolds from '../../components/order-detail/ReservationHolds.vue';
import ReservationPanel from '../../components/order-detail/ReservationPanel.vue';

const authStore = useAuthStore();
const route = useRoute();
const data = useOrderDetail(() => route.params.code as string);
const { order, reservations } = data;
const orderId = computed(() => order.value?.id ?? '');
const checks = useOrderChecks(orderId);
const canSeeChecks = computed(() => authStore.hasPermission('ReadCheckResults'));
const findings = computed(() => (canSeeChecks.value ? checks.findings.value : []));
const { consequences } = useFindingConsequences(findings, () => canSeeChecks.value);
const counterpartyId = computed(() => order.value?.customer?.counterparty?.id ?? null);
const kpiData = useCustomerKpiData(counterpartyId);
const contractPanel = ref<{ $el: HTMLElement } | null>(null);

// Mirrors DEFAULT_RESERVATION_DAYS in packages/plugins/reservation/src/types.ts; the form's value until the order loads.
const FALLBACK_RESERVATION_DAYS = 3;
const reservation = useReservationActions({
    orderId: () => orderId.value,
    reservations,
    defaultDays: () => order.value?.customFields.reservationDays ?? FALLBACK_RESERVATION_DAYS,
    onChanged: () => void data.reload(),
});

const editable = computed(
    () => !!order.value && !NON_EDITABLE_ORDER_STATES.includes(order.value.state),
);
const canEditLines = computed(
    () =>
        editable.value &&
        authStore.hasPermission('ConfirmOrder') &&
        !!order.value &&
        isNotRegisteredInErp(order.value.customFields),
);
const summary = computed(() =>
    summarizeFindings(findings.value, consequences.value, data.adjustmentRequests.value),
);

watch([orderId, reservations], () => {
    if (orderId.value && canSeeChecks.value) void checks.load();
});
</script>

<template>
    <div v-if="data.notFound.value" class="order-detail__not-found">
        <h1>Order not found</h1>
        <RouterLink to="/orders">Back to orders</RouterLink>
    </div>

    <div v-else-if="order" class="order-detail">
        <OrderHeader
            :order="order"
            :manager-name="data.managerName.value"
            :can-see-checks="canSeeChecks"
            :reservation="reservation"
            @recompute="checks.recompute"
            @cancelled="data.reload"
        />

        <CustomerKpiStrip
            v-if="counterpartyId && kpiData.loaded.value"
            :orders="kpiData.orders.value"
            :credit="data.credit.value"
            :outstanding="kpiData.outstanding.value"
        />

        <MvPanel title="Order lines">
            <OrderLinesTable
                :order-id="order.id"
                :lines="order.lines"
                :currency-code="order.currencyCode"
                :editable="editable"
                :can-edit-lines="canEditLines"
                :packages-only="order.packagesOnlySales"
                :adjustment-requests="data.adjustmentRequests.value"
                :findings="findings"
                :reservations="reservations"
                @adjusted="data.reload"
            />
            <OrderLinesTotals :order="order" />
        </MvPanel>

        <OrderFindingsStrip v-if="canSeeChecks" :summary="summary" />
        <div class="order-detail__review">
            <MvPanel v-if="canSeeChecks" title="Order controls">
                <OrderFindingsPanel
                    :findings="findings"
                    :consequences="consequences"
                    :lines="order.lines"
                    :can-recompute="canSeeChecks"
                    :recomputing="checks.recomputing.value"
                    :error="checks.error.value"
                    @recompute="checks.recompute"
                    @go-to-contract="contractPanel?.$el.scrollIntoView({ behavior: 'smooth' })"
                />
            </MvPanel>
            <MvPanel title="Approvals for this order">
                <OrderApprovalsPanel
                    :requests="data.adjustmentRequests.value"
                    :lines="order.lines"
                />
            </MvPanel>
        </div>

        <div class="order-detail__panels">
            <MvPanel v-if="data.shortfalls.value.length" title="Cut for lack of stock">
                <OrderShortfallPanel :rows="data.shortfalls.value" />
            </MvPanel>
            <MvPanel title="Reservation">
                <ReservationPanel :reservations="reservations" />
                <ReservationHolds :order-id="order.id" :refresh-on="reservations" />
            </MvPanel>
            <MvPanel ref="contractPanel" title="Contract">
                <OrderContractPanel
                    :order-id="order.id"
                    :locked="reservations.some(r => r.status === 'active')"
                    @changed="data.reload"
                />
            </MvPanel>
            <MvPanel title="Delivery">
                <OrderDeliveryPanel
                    :order-id="order.id"
                    :shipping-codes="order.shippingLines.map(l => l.shippingMethod?.code ?? '')"
                    :trading-point-id="order.customFields.tradingPointId"
                    :delivery-address="order.customFields.deliveryAddress"
                    :points="order.customer?.counterparty?.tradingPoints ?? []"
                    :can-edit="canEditLines"
                    @changed="data.reload"
                />
            </MvPanel>
            <PaymentReceivedPanel
                :order-id="order.id"
                :payments="order.payments ?? []"
                @confirmed="data.reload"
            />
            <ProformaInvoicesPanel :order-id="order.id" :cancelled="order.state === 'Cancelled'" />
            <MvPanel title="ERP registration">
                <OrderErpRegistration
                    :not-registered="isNotRegisteredInErp(order.customFields)"
                    :erp-status="order.customFields.erpRegistrationStatus ?? null"
                />
            </MvPanel>
            <OrderErpStatusPanels :order="order" />
            <MvPanel title="Order context">
                <OrderContextPanel
                    :order="order"
                    :manager-name="data.managerName.value"
                    :credit="data.credit.value"
                />
            </MvPanel>
            <MvPanel title="Documents">
                <RelatedDocumentsPanel :documents="data.documents.value" />
            </MvPanel>
        </div>
    </div>
</template>

<style scoped>
.order-detail {
    display: flex;
    flex-direction: column;
    gap: 18px;
}

.order-detail__review {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    gap: 18px;
    align-items: start;
}

.order-detail__panels {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 18px;
    align-items: start;
}

.order-detail__not-found {
    padding: 60px 0;
    text-align: center;
    color: var(--app-text-grey);
}
</style>
