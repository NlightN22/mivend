<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { MvNotice, MvPanel, MvSelect } from '@mivend/ui-kit';
import type { SelectOption } from '@mivend/ui-kit';
import { useLatestRequest } from '@mivend/ui-kit';
import { useAuthStore } from '../../stores/auth';
import { useUrlSyncedState } from '../../composables/useUrlSyncedState';
import WarehouseCurationTable from '../../components/settings/WarehouseCurationTable.vue';
import BranchSettingsForm from '../../components/settings/BranchSettingsForm.vue';
import {
    fetchBranchOptions,
    fetchBranchSettings,
    fetchPriceTypeOptions,
    fetchWarehouses,
    saveBranchSettings,
    updateWarehouseBranchAssignment,
    type BranchOption,
    type BranchSettings,
    type PriceTypeOption,
    type Warehouse,
} from '../../api/branchSettings';

const { t } = useI18n();
const authStore = useAuthStore();

const branches = ref<BranchOption[]>([]);
const priceTypes = ref<PriceTypeOption[]>([]);
const warehouses = ref<Warehouse[]>([]);
const loadError = ref('');
const loading = ref(true);

// A bounded warehouse list, exempt from server pagination: filtered and sliced client-side, search URL-synced.
const warehouseSearch = ref('');
const warehousePage = ref(1);
const warehousePageSize = ref(20);

interface WarehouseUrlFilters {
    [key: string]: string;
    warehouseSearch: string;
}
const URL_FILTER_DEFAULTS: WarehouseUrlFilters = { warehouseSearch: '' };
const { fromQuery, toQuery } = useUrlSyncedState(URL_FILTER_DEFAULTS);

{
    const parsed = { ...URL_FILTER_DEFAULTS };
    fromQuery(parsed, warehousePage);
    if (parsed.warehouseSearch) warehouseSearch.value = parsed.warehouseSearch;
}

function buildUrlFilters(): WarehouseUrlFilters {
    return { warehouseSearch: warehouseSearch.value };
}
watch(warehouseSearch, () => {
    warehousePage.value = 1;
});
watch([warehouseSearch, warehousePage], () => {
    toQuery(buildUrlFilters(), warehousePage);
});

const filteredWarehouses = computed<Warehouse[]>(() => {
    const term = warehouseSearch.value.trim().toLowerCase();
    if (!term) return warehouses.value;
    return warehouses.value.filter(
        w => w.name.toLowerCase().includes(term) || w.erpId.toLowerCase().includes(term),
    );
});
const pagedWarehouses = computed<Warehouse[]>(() => {
    const start = (warehousePage.value - 1) * warehousePageSize.value;
    return filteredWarehouses.value.slice(start, start + warehousePageSize.value);
});

function onWarehouseFilters(filters: { search: string }): void {
    warehouseSearch.value = filters.search;
}

const savingWarehouseId = ref<string | null>(null);
const reassignError = ref('');

async function loadAll(): Promise<void> {
    loading.value = true;
    loadError.value = '';
    try {
        [branches.value, priceTypes.value, warehouses.value] = await Promise.all([
            fetchBranchOptions(),
            fetchPriceTypeOptions(),
            fetchWarehouses(),
        ]);
    } catch (e) {
        loadError.value = e instanceof Error ? e.message : t('settingsAccess.branches.loadFailed');
    } finally {
        loading.value = false;
    }
}

async function onReassign(payload: {
    warehouseId: string;
    branchId: string;
    includedInBranchAtp: boolean;
}): Promise<void> {
    savingWarehouseId.value = payload.warehouseId;
    reassignError.value = '';
    try {
        const updated = await updateWarehouseBranchAssignment(
            payload.warehouseId,
            payload.branchId,
            payload.includedInBranchAtp,
        );
        const index = warehouses.value.findIndex(w => w.id === updated.id);
        if (index !== -1) warehouses.value[index] = updated;
    } catch (e) {
        reassignError.value =
            e instanceof Error ? e.message : t('settingsAccess.branches.warehouseFailed');
    } finally {
        savingWarehouseId.value = null;
    }
}

const branchSelectOptions = computed<SelectOption[]>(() =>
    branches.value.map(b => ({ value: b.id, label: b.name })),
);
const selectedBranchId = ref('');
watch(
    branches,
    list => {
        if (!selectedBranchId.value && list.length) {
            selectedBranchId.value = list[0].id;
        }
    },
    { immediate: true },
);

const branchSettings = ref<BranchSettings | null>(null);
const settingsLoadError = ref('');
const { loading: settingsLoading, run: runFetchSettings } = useLatestRequest(
    (branchId: string) => fetchBranchSettings(branchId),
    result => {
        branchSettings.value = result;
    },
);

watch(
    selectedBranchId,
    async branchId => {
        if (!branchId) return;
        settingsLoadError.value = '';
        try {
            await runFetchSettings(branchId);
        } catch (e) {
            settingsLoadError.value =
                e instanceof Error ? e.message : t('settingsAccess.branches.settingsLoadFailed');
        }
    },
    { immediate: true },
);

const saving = ref(false);
const saveError = ref('');

async function onSave(payload: {
    defaultPriceTypeId: string;
    visiblePriceTypeIds: string[];
    defaultWarehouseId: string;
    visibleWarehouseIds: string[];
    packagesOnly: boolean;
    prepaymentReserveDays: number;
    proformaPaymentTermDays: number;
}): Promise<void> {
    if (!selectedBranchId.value) return;
    saving.value = true;
    saveError.value = '';
    try {
        branchSettings.value = await saveBranchSettings({
            branchId: selectedBranchId.value,
            defaultPriceTypeId: payload.defaultPriceTypeId,
            visiblePriceTypeIds: payload.visiblePriceTypeIds.length
                ? payload.visiblePriceTypeIds
                : null,
            defaultWarehouseId: payload.defaultWarehouseId,
            visibleWarehouseIds: payload.visibleWarehouseIds.length
                ? payload.visibleWarehouseIds
                : null,
            packagesOnly: payload.packagesOnly,
            prepaymentReserveDays: payload.prepaymentReserveDays,
            proformaPaymentTermDays: payload.proformaPaymentTermDays,
        });
    } catch (e) {
        saveError.value = e instanceof Error ? e.message : t('settingsAccess.branches.saveFailed');
    } finally {
        saving.value = false;
    }
}

onMounted(loadAll);
</script>

<template>
    <div
        v-if="!authStore.hasPermission('ManageAccessControl')"
        class="branch-settings-page__not-authorized"
    >
        <h1>{{ t('settingsAccess.notAuthorized') }}</h1>
        <p>{{ t('settingsAccess.branches.denied') }}</p>
    </div>

    <div v-else class="branch-settings-page">
        <div class="branch-settings-page__breadcrumb">{{ t('settingsAccess.breadcrumb') }}</div>
        <h1 class="branch-settings-page__title">{{ t('settingsAccess.branches.title') }}</h1>

        <MvNotice v-if="loadError" variant="error">{{ loadError }}</MvNotice>

        <MvPanel :title="t('settingsAccess.branches.warehousePanel')">
            <template #subheader>
                <p class="branch-settings-page__description">
                    {{ t('settingsAccess.branches.warehouseLead') }}
                </p>
            </template>

            <MvNotice v-if="reassignError" variant="error">{{ reassignError }}</MvNotice>
            <WarehouseCurationTable
                :warehouses="pagedWarehouses"
                :branches="branches"
                :loading="loading"
                :saving-warehouse-id="savingWarehouseId"
                :total-items="filteredWarehouses.length"
                :page="warehousePage"
                :page-size="warehousePageSize"
                :search-filter="warehouseSearch"
                :administrator-id="authStore.administrator?.id ?? 'anonymous'"
                @reassign="onReassign"
                @update:filters="onWarehouseFilters"
                @update:page="warehousePage = $event"
                @update:page-size="warehousePageSize = $event"
            />
        </MvPanel>

        <MvPanel :title="t('settingsAccess.branches.settingsPanel')">
            <template #subheader>
                <p class="branch-settings-page__description">
                    {{ t('settingsAccess.branches.settingsLead') }}
                </p>
            </template>

            <MvSelect v-model="selectedBranchId" :options="branchSelectOptions" />
            <div class="branch-settings-page__divider" />
            <MvNotice v-if="settingsLoadError" variant="error">{{ settingsLoadError }}</MvNotice>
            <BranchSettingsForm
                v-if="!settingsLoading"
                :settings="branchSettings"
                :price-types="priceTypes"
                :warehouses="warehouses"
                :saving="saving"
                :save-error="saveError"
                @save="onSave"
            />
        </MvPanel>
    </div>
</template>

<style scoped>
.branch-settings-page {
    display: flex;
    flex-direction: column;
    gap: 18px;
}

.branch-settings-page__description {
    margin: 0;
    font-size: 13px;
    color: var(--el-text-color-secondary);
}

.branch-settings-page__divider {
    height: 1px;
    margin: 14px 0;
    background: var(--el-border-color);
}

.branch-settings-page__breadcrumb {
    color: var(--el-text-color-secondary);
    font-size: 13px;
}

.branch-settings-page__title {
    margin: 0;
    font-size: 28px;
    letter-spacing: -0.03em;
}

.branch-settings-page__not-authorized {
    padding: 60px 0;
    text-align: center;
    color: var(--el-text-color-secondary);
}
</style>
