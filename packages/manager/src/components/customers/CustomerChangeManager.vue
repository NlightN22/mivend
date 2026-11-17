<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { MvButton, MvModal, MvNotice, MvSelect } from '@mivend/ui-kit';
import type { ManagerOption } from '../../api/orders';
import { useChangeManager } from '../../composables/useChangeManager';

// Names the old and the new manager before the one-record batch is started.
const props = defineProps<{
    counterpartyId: string;
    counterpartyName: string;
    currentManagerId: string | null;
    managers: ManagerOption[];
}>();
const emit = defineEmits<{ changed: [] }>();

const { t } = useI18n();
const open = ref(false);
const target = ref('');
const { busy, error, submit } = useChangeManager(
    () => props.counterpartyId,
    () => {
        open.value = false;
        emit('changed');
    },
);

const nameOf = (id: string | null): string =>
    props.managers.find(m => m.id === id)?.name ?? t('customers.detail.unassigned');
const options = computed(() => [
    { value: '', label: t('bulkOperations.managerReassign.placeholder') },
    ...props.managers
        .filter(m => m.id !== props.currentManagerId)
        .map(m => ({ value: m.id, label: m.name })),
]);
</script>

<template>
    <div class="customer-change-manager">
        <MvButton variant="secondary" data-testid="change-manager" @click="open = true">
            {{ t('customers.detail.changeManager') }}
        </MvButton>
        <MvModal v-if="open" :title="t('customers.detail.changeManager')" @close="open = false">
            <div class="customer-change-manager__body">
                <MvSelect
                    v-model="target"
                    :options="options"
                    :title="t('bulkOperations.managerReassign.legend')"
                    data-testid="change-manager-target"
                />
                <p
                    v-if="target"
                    class="customer-change-manager__confirm"
                    data-testid="change-manager-confirm"
                >
                    {{
                        t('customers.detail.changeManagerConfirm', {
                            name: counterpartyName,
                            from: nameOf(currentManagerId),
                            to: nameOf(target),
                        })
                    }}
                </p>
                <MvNotice v-if="error" variant="error">{{ error }}</MvNotice>
                <div class="customer-change-manager__actions">
                    <MvButton variant="secondary" @click="open = false">{{
                        t('common.cancel')
                    }}</MvButton>
                    <MvButton
                        :disabled="!target || busy"
                        data-testid="change-manager-apply"
                        @click="submit(target)"
                    >
                        {{ t('customers.detail.changeManagerApply') }}
                    </MvButton>
                </div>
            </div>
        </MvModal>
    </div>
</template>

<style scoped>
.customer-change-manager__body {
    display: flex;
    flex-direction: column;
    gap: 14px;
}

.customer-change-manager__confirm {
    margin: 0;
}

.customer-change-manager__actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
}
</style>
