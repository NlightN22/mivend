<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { MvNotice, MvSelect } from '@mivend/ui-kit';
import { fetchManagerOptions, type ManagerOption } from '../../api/orders';

const props = defineProps<{ modelValue: Record<string, unknown> }>();
const emit = defineEmits<{ 'update:modelValue': [parameters: Record<string, unknown>] }>();

const { t } = useI18n();
const managers = ref<ManagerOption[]>([]);
const error = ref('');
const options = computed(() => [
    { value: '', label: t('bulkOperations.managerReassign.placeholder') },
    ...managers.value.map(m => ({ value: m.id, label: m.name })),
]);

onMounted(async () => {
    try {
        managers.value = await fetchManagerOptions();
    } catch (e) {
        error.value = e instanceof Error ? e.message : t('bulkOperations.managerReassign.failed');
    }
});
</script>

<template>
    <div class="manager-reassign">
        <label class="manager-reassign__field">
            <span class="manager-reassign__legend">
                {{ t('bulkOperations.managerReassign.legend') }}
            </span>
            <MvSelect
                :model-value="String(props.modelValue.administratorId ?? '')"
                :options="options"
                :title="t('bulkOperations.managerReassign.legend')"
                data-testid="reassign-target"
                @update:model-value="emit('update:modelValue', { administratorId: $event })"
            />
        </label>
        <MvNotice v-if="error" variant="error">{{ error }}</MvNotice>
        <MvNotice variant="info">{{ t('bulkOperations.managerReassign.notice') }}</MvNotice>
    </div>
</template>

<style scoped>
.manager-reassign {
    display: flex;
    flex-direction: column;
    gap: 16px;
    max-width: 720px;
}

.manager-reassign__field {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.manager-reassign__legend {
    font-weight: 600;
}
</style>
