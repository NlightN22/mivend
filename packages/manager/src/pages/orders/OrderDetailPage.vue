<script setup lang="ts">
import { computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import { MvPanel } from '@mivend/ui-kit';
import { useAuthStore } from '../../stores/auth';
import { NON_EDITABLE_ORDER_STATES } from '../../api/orderDetail';
import { isNotRegisteredInErp } from '../../composables/isNotRegisteredInErp';
import { useCustomerKpiData } from '../../composables/useCustomerKpiData';
import { useFindingConsequences } from '../../composables/useFindingConsequences';
import { useOrderChecks } from '../../composables/useOrderChecks';
import { useOrderDetail } from '../../composables/useOrderDetail';
import { useOrderHeaderCommands } from '../../composables/useOrderHeaderCommands';
import { useReservationActions } from '../../composables/useReservationActions';
import { contractBlockedSkus } from '../../utils/orderLineChecks';
import { orderLevelProblem } from '../../utils/orderLineProblems';
import OrderApprovalsPanel from '../../components/order-detail/OrderApprovalsPanel.vue';
import OrderCell from '../../components/order-detail/OrderCell.vue';
import OrderCustomerSummary from '../../components/order-detail/OrderCustomerSummary.vue';
import OrderErpStatusPanels from '../../components/order-detail/OrderErpStatusPanels.vue';
import OrderHeader from '../../components/order-detail/OrderHeader.vue';
import OrderHistory from '../../components/order-detail/OrderHistory.vue';
import OrderLinesTable from '../../components/order-detail/OrderLinesTable.vue';
import OrderLinesTotals from '../../components/order-detail/OrderLinesTotals.vue';
import OrderShortfallPanel from '../../components/order-detail/OrderShortfallPanel.vue';
import PaymentReceivedPanel from '../../components/order-detail/PaymentReceivedPanel.vue';

const authStore = useAuthStore();
const route = useRoute();
const data = useOrderDetail(() => route.params.code as string);
const { order, reservations } = data;
const orderId = computed(() => order.value?.id ?? '');
const checks = useOrderChecks(orderId);
const canSeeChecks = computed(() => authStore.hasPermission('ReadCheckResults'));
const findings = computed(() => (canSeeChecks.value ? checks.findings.value : []));
const { consequences } = useFindingConsequences(
    findings,
    () => canSeeChecks.value,
    () => order.value?.customFields.branchId ?? null,
);
const counterpartyId = computed(() => order.value?.customer?.counterparty?.id ?? null);
const kpiData = useCustomerKpiData(counterpartyId);

// Mirrors DEFAULT_RESERVATION_DAYS in packages/plugins/reservation/src/types.ts; the form's value until the order loads.
const FALLBACK_RESERVATION_DAYS = 3;
const reservation = useReservationActions({
    orderId: () => orderId.value,
    reservations,
    defaultDays: () => order.value?.customFields.reservationDays ?? FALLBACK_RESERVATION_DAYS,
    onChanged: () => void data.reload(),
});
const commands = useOrderHeaderCommands({
    order,
    reservation,
    canSeeChecks: () => canSeeChecks.value,
    onCancelled: () => void data.reload(),
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
const orderProblem = computed(() => orderLevelProblem(findings.value, consequences.value));

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
            :documents="data.documents.value"
            :commands="commands"
            :reservation="reservation"
            :contract-locked="reservations.some(r => r.status === 'active')"
            :blocked-skus="contractBlockedSkus(findings, order.lines)"
            :can-edit-delivery="canEditLines"
            @recompute="checks.recompute"
            @changed="data.reload"
        />

        <OrderCustomerSummary
            v-if="counterpartyId && kpiData.loaded.value"
            :orders="kpiData.orders.value"
            :credit="data.credit.value"
            :outstanding="kpiData.outstanding.value"
        />

        <OrderErpStatusPanels :order="order" />
        <MvPanel v-if="data.shortfalls.value.length" title="Cut for lack of stock">
            <OrderShortfallPanel :rows="data.shortfalls.value" />
        </MvPanel>
        <PaymentReceivedPanel
            :order-id="order.id"
            :payments="order.payments ?? []"
            @confirmed="data.reload"
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
                :consequences="consequences"
                :reservations="reservations"
                :can-confirm="commands.canConfirm.value"
                :can-reject="commands.canCancel.value"
                @adjusted="data.reload"
                @confirm="commands.confirmOpen.value = true"
                @reject="commands.cancelOpen.value = true"
            />
            <OrderLinesTotals :order="order">
                <template #flag>
                    <OrderCell
                        v-if="orderProblem"
                        :problem="orderProblem"
                        :consequences="consequences"
                        :can-confirm="commands.canConfirm.value"
                        :can-reject="commands.canCancel.value"
                        @confirm="commands.confirmOpen.value = true"
                        @reject="commands.cancelOpen.value = true"
                    />
                </template>
            </OrderLinesTotals>
        </MvPanel>

        <div class="order-detail__below">
            <OrderHistory :history="order.statusHistory" />
            <section v-if="data.adjustmentRequests.value.length">
                <h2 class="order-detail__heading">Approvals</h2>
                <OrderApprovalsPanel
                    :requests="data.adjustmentRequests.value"
                    :lines="order.lines"
                />
            </section>
        </div>
    </div>
</template>

<style scoped>
.order-detail {
    display: flex;
    flex-direction: column;
    gap: 18px;
}

.order-detail__below {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    gap: 18px;
    align-items: start;
}

.order-detail__heading {
    margin: 0 0 14px;
    font-size: 18px;
    font-weight: 900;
}

.order-detail__not-found {
    padding: 60px 0;
    text-align: center;
    color: var(--app-text-grey);
}
</style>
