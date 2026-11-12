<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { MvPopover, MvStatusBadge } from '@mivend/ui-kit';
import { useOrderStatusesStore } from '../../stores/orderStatuses';

const { t } = useI18n();
const props = defineProps<{
    notRegistered: boolean;
    erpStatus: string | null;
    rawErpStatus: string | null;
    documentNumber: string | null;
    rejectionCode: string | null;
    rejectionText: string | null;
}>();

const statuses = useOrderStatusesStore();
void statuses.load();
const rejected = computed(() => statuses.isRejected(props.rawErpStatus));
const details = computed(() =>
    [
        [t('orderDetail.erp.documentNumber'), props.documentNumber],
        [t('orderDetail.erp.registrationStatus'), props.erpStatus],
        [t('orderDetail.erp.reasonCode'), props.rejectionCode],
        [t('orderDetail.erp.reason'), props.rejectionText],
    ].filter((row): row is [string, string] => !!row[1]),
);
</script>

<template>
    <MvPopover v-if="details.length || rejected">
        <template #trigger>
            <button
                type="button"
                class="erp-registration"
                :aria-label="t('orderDetail.erp.showDetails')"
            >
                <MvStatusBadge v-if="rejected" variant="danger">{{
                    t('orderDetail.erp.rejected')
                }}</MvStatusBadge>
                <MvStatusBadge v-else-if="notRegistered" variant="warning">
                    {{ t('orderDetail.erp.notRegistered') }}
                </MvStatusBadge>
                <MvStatusBadge v-else variant="success">{{
                    erpStatus ?? t('orderDetail.erp.registered')
                }}</MvStatusBadge>
            </button>
        </template>
        <div v-for="[label, value] in details" :key="label" class="erp-registration__row">
            <span class="erp-registration__label">{{ label }}</span>
            <span>{{ value }}</span>
        </div>
        <span v-if="rejected && !details.length">{{ t('orderDetail.erp.notAccepted') }}</span>
    </MvPopover>
    <MvStatusBadge v-else-if="notRegistered" variant="warning">{{
        t('orderDetail.erp.notRegistered')
    }}</MvStatusBadge>
    <MvStatusBadge v-else variant="success">{{
        erpStatus ?? t('orderDetail.erp.registered')
    }}</MvStatusBadge>
</template>

<style scoped>
.erp-registration {
    padding: 0;
    border: 0;
    background: transparent;
    cursor: pointer;
}

.erp-registration__row {
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.erp-registration__label {
    color: var(--app-text-grey);
    font-size: 12px;
}
</style>
