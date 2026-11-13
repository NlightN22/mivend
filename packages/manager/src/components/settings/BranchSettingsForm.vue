<script setup lang="ts">
import { computed, reactive, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
    MvFormField,
    MvInput,
    MvSelect,
    MvMultiSelect,
    MvButton,
    MvNotice,
    MvSwitch,
} from '@mivend/ui-kit';
import type { SelectOption } from '@mivend/ui-kit';
import type { BranchSettings, PriceTypeOption, Warehouse } from '../../api/branchSettings';

const { t } = useI18n();
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
            packagesOnly: boolean;
            prepaymentReserveDays: number;
            proformaPaymentTermDays: number;
        },
    ];
}>();

const form = reactive({
    defaultPriceTypeId: '',
    visiblePriceTypeIds: [] as string[],
    defaultWarehouseId: '',
    visibleWarehouseIds: [] as string[],
    packagesOnly: false,
    prepaymentReserveDays: 3,
    proformaPaymentTermDays: 3,
});

// Re-seeds on every branch switch; the two required selects start empty and block save.
watch(
    () => props.settings,
    settings => {
        form.defaultPriceTypeId = settings?.defaultPriceTypeId ?? '';
        form.visiblePriceTypeIds = settings?.visiblePriceTypeIds ?? [];
        form.defaultWarehouseId = settings?.defaultWarehouseId ?? '';
        form.visibleWarehouseIds = settings?.visibleWarehouseIds ?? [];
        form.packagesOnly = settings?.packagesOnly ?? false;
        form.prepaymentReserveDays = settings?.prepaymentReserveDays ?? 3;
        form.proformaPaymentTermDays = settings?.proformaPaymentTermDays ?? 3;
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
    { value: '', label: t('settingsAccess.branches.form.selectPriceType') },
    ...priceTypeOptions.value,
]);
const warehouseSelectOptions = computed<SelectOption[]>(() => [
    { value: '', label: t('settingsAccess.branches.form.selectWarehouse') },
    ...warehouseOptions.value,
]);

const missingRequired = computed(() => !form.defaultPriceTypeId || !form.defaultWarehouseId);

function onSave(): void {
    if (missingRequired.value) return;
    emit('save', {
        defaultPriceTypeId: form.defaultPriceTypeId,
        visiblePriceTypeIds: form.visiblePriceTypeIds,
        defaultWarehouseId: form.defaultWarehouseId,
        visibleWarehouseIds: form.visibleWarehouseIds,
        packagesOnly: form.packagesOnly,
        prepaymentReserveDays: form.prepaymentReserveDays,
        proformaPaymentTermDays: form.proformaPaymentTermDays,
    });
}
</script>

<template>
    <form class="branch-settings-form" @submit.prevent="onSave">
        <section class="branch-settings-form__section">
            <h3 class="branch-settings-form__section-title">
                {{ t('settingsAccess.branches.form.defaults') }}
            </h3>

            <MvFormField :label="t('settingsAccess.branches.form.defaultPriceType')" required>
                <MvSelect v-model="form.defaultPriceTypeId" :options="priceTypeSelectOptions" />
            </MvFormField>

            <MvFormField :label="t('settingsAccess.branches.form.defaultWarehouse')" required>
                <MvSelect v-model="form.defaultWarehouseId" :options="warehouseSelectOptions" />
            </MvFormField>
        </section>

        <section class="branch-settings-form__section">
            <h3 class="branch-settings-form__section-title">
                {{ t('settingsAccess.branches.form.visibility') }}
            </h3>

            <MvFormField :label="t('settingsAccess.branches.form.visiblePriceTypes')">
                <MvMultiSelect v-model="form.visiblePriceTypeIds" :options="priceTypeOptions" />
                <p class="branch-settings-form__hint">
                    {{ t('settingsAccess.branches.form.allPriceTypes') }}
                </p>
            </MvFormField>

            <MvFormField :label="t('settingsAccess.branches.form.visibleWarehouses')">
                <MvMultiSelect v-model="form.visibleWarehouseIds" :options="warehouseOptions" />
                <p class="branch-settings-form__hint">
                    {{ t('settingsAccess.branches.form.allWarehouses') }}
                </p>
            </MvFormField>
        </section>

        <section class="branch-settings-form__section">
            <h3 class="branch-settings-form__section-title">
                {{ t('settingsAccess.branches.form.sales') }}
            </h3>

            <MvFormField :label="t('settingsAccess.branches.form.packagesOnly')">
                <MvSwitch
                    v-model="form.packagesOnly"
                    :label="t('settingsAccess.branches.form.enabled')"
                />
                <p class="branch-settings-form__hint">
                    {{ t('settingsAccess.branches.form.packagesHint') }}
                </p>
            </MvFormField>

            <p class="branch-settings-form__hint">
                {{ t('settingsAccess.branches.form.controlsHint') }}
            </p>
        </section>

        <section class="branch-settings-form__section">
            <h3 class="branch-settings-form__section-title">
                {{ t('settingsAccess.branches.form.credit') }}
            </h3>

            <MvFormField :label="t('settingsAccess.branches.form.reserveDays')">
                <MvInput
                    :model-value="String(form.prepaymentReserveDays)"
                    type="number"
                    min="1"
                    @update:model-value="form.prepaymentReserveDays = Number($event)"
                />
                <p class="branch-settings-form__hint">
                    {{ t('settingsAccess.branches.form.reserveHint') }}
                </p>
            </MvFormField>

            <MvFormField :label="t('settingsAccess.branches.form.termDays')">
                <MvInput
                    :model-value="String(form.proformaPaymentTermDays)"
                    type="number"
                    min="1"
                    max="90"
                    @update:model-value="form.proformaPaymentTermDays = Number($event)"
                />
                <p class="branch-settings-form__hint">
                    {{ t('settingsAccess.branches.form.termHint') }}
                </p>
            </MvFormField>
        </section>

        <MvNotice v-if="missingRequired" variant="warning">
            {{ t('settingsAccess.branches.form.required') }}
        </MvNotice>
        <MvNotice v-if="saveError" variant="error">{{ saveError }}</MvNotice>

        <div class="branch-settings-form__actions">
            <MvButton native-type="submit" :disabled="missingRequired || saving" :loading="saving">
                {{ t('settingsAccess.branches.form.save') }}
            </MvButton>
        </div>
    </form>
</template>

<style scoped>
.branch-settings-form {
    display: flex;
    flex-direction: column;
    gap: 20px;
    max-width: 480px;
}

.branch-settings-form__section {
    display: flex;
    flex-direction: column;
    gap: 14px;
}

.branch-settings-form__section-title {
    margin: 0;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: 800;
    color: var(--el-text-color-secondary);
}

.branch-settings-form__hint {
    margin: 4px 0 0;
    font-size: 12px;
    color: var(--el-text-color-secondary);
}

.branch-settings-form__actions {
    display: flex;
    justify-content: flex-end;
}
</style>
