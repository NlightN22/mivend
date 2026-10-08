<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { MvNotice, MvSelect, MvStatusBadge } from '@mivend/ui-kit';
import { useAuthStore } from '../../stores/auth';
import {
    fetchOrderContracts,
    setOrderContract,
    type OrderContractOption,
} from '../../api/reservation';

const props = defineProps<{ orderId: string; locked: boolean }>();
const emit = defineEmits<{ changed: [] }>();

const authStore = useAuthStore();
const options = ref<OrderContractOption[]>([]);
const saving = ref(false);
const error = ref('');

const selected = computed(() => options.value.find(o => o.isSelected) ?? null);
const canChange = computed(() => authStore.hasPermission('ConfirmOrder') && !props.locked);
const selectOptions = computed(() =>
    options.value.map(o => ({
        value: o.erpId,
        label: [o.name ?? o.erpId, o.organizationName, o.paymentKind].filter(Boolean).join(' · '),
    })),
);

async function load(): Promise<void> {
    try {
        options.value = await fetchOrderContracts(props.orderId);
    } catch (e) {
        error.value = e instanceof Error ? e.message : 'Could not load contracts';
    }
}

async function change(contractId: string): Promise<void> {
    error.value = '';
    saving.value = true;
    try {
        options.value = await setOrderContract(props.orderId, contractId);
        emit('changed');
    } catch (e) {
        error.value = e instanceof Error ? e.message : 'Could not change the contract';
    } finally {
        saving.value = false;
    }
}

watch(() => props.orderId, load, { immediate: true });
</script>

<template>
    <div class="order-contract">
        <MvNotice v-if="!options.length && !error" variant="warning">
            No active contract: the order cannot be registered in the ERP.
        </MvNotice>
        <template v-else-if="options.length">
            <MvSelect
                :model-value="selected?.erpId ?? ''"
                :options="selectOptions"
                :disabled="!canChange || saving"
                @update:model-value="change"
            />
            <div class="order-contract__meta">
                <MvStatusBadge v-if="selected?.isMain" variant="info">Main contract</MvStatusBadge>
                <span v-if="locked" class="order-contract__hint">
                    Release the reservation to change the contract.
                </span>
            </div>
        </template>
        <MvNotice v-if="error" variant="error">{{ error }}</MvNotice>
    </div>
</template>

<style scoped>
.order-contract {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.order-contract__meta {
    display: flex;
    align-items: center;
    gap: 10px;
}

.order-contract__hint {
    font-size: 13px;
    color: var(--el-text-color-secondary, #6b7280);
}
</style>
