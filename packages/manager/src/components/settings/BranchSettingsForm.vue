<script setup lang="ts">
import { computed, reactive, watch } from 'vue';
import { MvFormField, MvSelect, MvMultiSelect, MvButton, MvNotice } from '@mivend/ui-kit';
import type { SelectOption } from '@mivend/ui-kit';
import type { BranchSettings, PriceTypeOption, Warehouse } from '../../api/branchSettings';

const props = defineProps<{
    settings: BranchSettings | null;
    priceTypes: PriceTypeOption[];
    warehouses: Warehouse[];
    saving: boolean;
    saveError: string;
}>();

const emit = defineEmits<{
    save: [
        payload: {
            defaultPriceTypeId: string;
            visiblePriceTypeIds: string[];
            defaultWarehouseId: string;
            visibleWarehouseIds: string[];
        },
    ];
}>();

const form = reactive({
    defaultPriceTypeId: '',
    visiblePriceTypeIds: [] as string[],
    defaultWarehouseId: '',
    visibleWarehouseIds: [] as string[],
});

// Re-seeds the form whenever a different branch's settings load (or none exist yet) — the two
// required fields have no sensible default value to fall back to, they start empty and block
// save until the user picks something (issue #66 acceptance criterion).
watch(
    () => props.settings,
    settings => {
        form.defaultPriceTypeId = settings?.defaultPriceTypeId ?? '';
        form.visiblePriceTypeIds = settings?.visiblePriceTypeIds ?? [];
        form.defaultWarehouseId = settings?.defaultWarehouseId ?? '';
        form.visibleWarehouseIds = settings?.visibleWarehouseIds ?? [];
    },
    { immediate: true },
);

const priceTypeOptions = computed<SelectOption[]>(() =>
    props.priceTypes.map(pt => ({ value: pt.id, label: `${pt.name} (${pt.code})` })),
);
const warehouseOptions = computed<SelectOption[]>(() =>
    props.warehouses.map(w => ({ value: w.id, label: w.name })),
);

const priceTypeSelectOptions = computed<SelectOption[]>(() => [
    { value: '', label: 'Select a price type…' },
    ...priceTypeOptions.value,
]);
const warehouseSelectOptions = computed<SelectOption[]>(() => [
    { value: '', label: 'Select a warehouse…' },
    ...warehouseOptions.value,
]);

const missingRequired = computed(
    () => !form.defaultPriceTypeId || !form.defaultWarehouseId,
);

function onSave(): void {
    if (missingRequired.value) return;
    emit('save', {
        defaultPriceTypeId: form.defaultPriceTypeId,
        visiblePriceTypeIds: form.visiblePriceTypeIds,
        defaultWarehouseId: form.defaultWarehouseId,
        visibleWarehouseIds: form.visibleWarehouseIds,
    });
}
</script>

<template>
    <form class="branch-settings-form" @submit.prevent="onSave">
        <MvFormField label="Default price type" required>
            <MvSelect v-model="form.defaultPriceTypeId" :options="priceTypeSelectOptions" />
        </MvFormField>

        <MvFormField label="Default warehouse" required>
            <MvSelect v-model="form.defaultWarehouseId" :options="warehouseSelectOptions" />
        </MvFormField>

        <MvFormField label="Visible price types">
            <MvMultiSelect v-model="form.visiblePriceTypeIds" :options="priceTypeOptions" />
            <p class="branch-settings-form__hint">Leave empty to allow every price type.</p>
        </MvFormField>

        <MvFormField label="Visible warehouses">
            <MvMultiSelect v-model="form.visibleWarehouseIds" :options="warehouseOptions" />
            <p class="branch-settings-form__hint">Leave empty to allow every warehouse.</p>
        </MvFormField>

        <MvNotice v-if="missingRequired" variant="warning">
            Default price type and default warehouse are required before saving.
        </MvNotice>
        <MvNotice v-if="saveError" variant="error">{{ saveError }}</MvNotice>

        <MvButton
            native-type="submit"
            :disabled="missingRequired || saving"
            :loading="saving"
        >
            Save branch settings
        </MvButton>
    </form>
</template>

<style scoped>
.branch-settings-form {
    display: flex;
    flex-direction: column;
    gap: 14px;
    max-width: 480px;
}

.branch-settings-form__hint {
    margin: 4px 0 0;
    font-size: 12px;
    color: var(--el-text-color-secondary, #6b7280);
}
</style>
