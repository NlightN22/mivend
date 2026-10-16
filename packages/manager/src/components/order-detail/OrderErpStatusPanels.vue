<script setup lang="ts">
import { MvPanel, MvStatusBadge } from '@mivend/ui-kit';
import type { OrderDetail } from '../../api/orderDetail';
import { useOrderStatusesStore } from '../../stores/orderStatuses';
import ReservationFailurePanel from './ReservationFailurePanel.vue';

defineProps<{ order: OrderDetail }>();

const statuses = useOrderStatusesStore();
void statuses.load();
</script>

<template>
    <MvPanel
        v-if="
            order.customFields.erpRegistrationDocumentNumber ||
            order.customFields.erpRegistrationStatus
        "
        title="ERP document"
    >
        <div
            v-if="order.customFields.erpRegistrationDocumentNumber"
            class="order-detail__rejection-row"
        >
            <span class="order-detail__rejection-label">Document number</span>
            <span>{{ order.customFields.erpRegistrationDocumentNumber }}</span>
        </div>
        <div v-if="order.customFields.erpRegistrationStatus" class="order-detail__rejection-row">
            <span class="order-detail__rejection-label">Registration status</span>
            <span>{{ order.customFields.erpRegistrationStatus }}</span>
        </div>
    </MvPanel>
    <MvPanel v-if="statuses.isRejected(order.customFields.erpStatus)" title="Rejected by ERP">
        <div class="order-detail__rejection">
            <MvStatusBadge variant="danger">Rejected by ERP</MvStatusBadge>
            <div
                v-if="order.customFields.erpRejectionReasonCode"
                class="order-detail__rejection-row"
            >
                <span class="order-detail__rejection-label">Reason code</span>
                <span>{{ order.customFields.erpRejectionReasonCode }}</span>
            </div>
            <div
                v-if="order.customFields.erpRejectionReasonText"
                class="order-detail__rejection-row"
            >
                <span class="order-detail__rejection-label">Reason</span>
                <span>{{ order.customFields.erpRejectionReasonText }}</span>
            </div>
        </div>
    </MvPanel>

    <MvPanel v-if="order.customFields.reservationFailureReason" title="Reservation failed">
        <ReservationFailurePanel
            :reason="order.customFields.reservationFailureReason"
            :detail="order.customFields.reservationFailureDetail"
            :failed-at="order.customFields.reservationFailedAt"
        />
    </MvPanel>
</template>

<style scoped>
.order-detail__rejection {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.order-detail__rejection-row {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 13px;
}

.order-detail__rejection-label {
    color: var(--el-text-color-secondary, #6b7280);
    font-size: 12px;
}
</style>
