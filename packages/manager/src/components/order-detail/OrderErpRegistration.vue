<script setup lang="ts">
import { computed } from 'vue';
import { MvPopover, MvStatusBadge } from '@mivend/ui-kit';
import { useOrderStatusesStore } from '../../stores/orderStatuses';

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
        ['Document number', props.documentNumber],
        ['Registration status', props.erpStatus],
        ['Reason code', props.rejectionCode],
        ['Reason', props.rejectionText],
    ].filter((row): row is [string, string] => !!row[1]),
);
</script>

<template>
    <MvPopover v-if="details.length || rejected">
        <template #trigger>
            <button
                type="button"
                class="erp-registration"
                aria-label="Show ERP registration details"
            >
                <MvStatusBadge v-if="rejected" variant="danger">Rejected by ERP</MvStatusBadge>
                <MvStatusBadge v-else-if="notRegistered" variant="warning">
                    Not registered in the ERP
                </MvStatusBadge>
                <MvStatusBadge v-else variant="success">{{
                    erpStatus ?? 'Registered'
                }}</MvStatusBadge>
            </button>
        </template>
        <div v-for="[label, value] in details" :key="label" class="erp-registration__row">
            <span class="erp-registration__label">{{ label }}</span>
            <span>{{ value }}</span>
        </div>
    </MvPopover>
    <MvStatusBadge v-else-if="notRegistered" variant="warning"
        >Not registered in the ERP</MvStatusBadge
    >
    <MvStatusBadge v-else variant="success">{{ erpStatus ?? 'Registered' }}</MvStatusBadge>
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
