<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { MvInput, MvNotice, MvPanel, MvSelect } from '@mivend/ui-kit';
import type { SelectOption } from '@mivend/ui-kit';
import { useLatestRequest } from '@mivend/ui-kit';
import { useAuthStore } from '../../stores/auth';
import SettingsSubNav from '../../components/settings/SettingsSubNav.vue';
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

const authStore = useAuthStore();
const route = useRoute();
const router = useRouter();

const branches = ref<BranchOption[]>([]);
const priceTypes = ref<PriceTypeOption[]>([]);
const warehouses = ref<Warehouse[]>([]);
const loadError = ref('');
const loading = ref(true);

// Warehouses are a bounded ERP org-structure list (a few dozen at most, one per physical/
// logical warehouse) — client-side text filtering is acceptable here, same exemption class as
// TeamDirectoryTable's department roster (AGENTS.md's Pagination section: "exempt only if
// genuinely, structurally bounded"). Still URL-synced per the manager-portal rule, since it's a
// real user-facing filter someone may want to share/bookmark.
const warehouseSearch = ref(typeof route.query.warehouseSearch === 'string' ? route.query.warehouseSearch : '');
watch(warehouseSearch, value => {
    const query = { ...route.query };
    if (value) {
        query.warehouseSearch = value;
    } else {
        delete query.warehouseSearch;
    }
    void router.replace({ query });
});

const filteredWarehouses = computed<Warehouse[]>(() => {
    const term = warehouseSearch.value.trim().toLowerCase();
    if (!term) return warehouses.value;
    return warehouses.value.filter(
        w => w.name.toLowerCase().includes(term) || w.erpId.toLowerCase().includes(term),
    );
});

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
        loadError.value = e instanceof Error ? e.message : 'Could not load branch settings data';
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
        reassignError.value = e instanceof Error ? e.message : 'Could not update warehouse';
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
            settingsLoadError.value = e instanceof Error ? e.message : 'Could not load branch settings';
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
}): Promise<void> {
    if (!selectedBranchId.value) return;
    saving.value = true;
    saveError.value = '';
    try {
        branchSettings.value = await saveBranchSettings({
            branchId: selectedBranchId.value,
            defaultPriceTypeId: payload.defaultPriceTypeId,
            visiblePriceTypeIds: payload.visiblePriceTypeIds.length ? payload.visiblePriceTypeIds : null,
            defaultWarehouseId: payload.defaultWarehouseId,
            visibleWarehouseIds: payload.visibleWarehouseIds.length ? payload.visibleWarehouseIds : null,
        });
    } catch (e) {
        saveError.value = e instanceof Error ? e.message : 'Could not save branch settings';
    } finally {
        saving.value = false;
    }
}

onMounted(loadAll);
</script>

<template>
    <div v-if="!authStore.hasPermission('ManageAccessControl')" class="branch-settings-page__not-authorized">
        <h1>Not authorized</h1>
        <p>You don't have permission to manage branch settings.</p>
    </div>

    <div v-else class="branch-settings-page">
        <div class="branch-settings-page__breadcrumb">Workspace / Settings</div>
        <h1 class="branch-settings-page__title">Branches</h1>
        <SettingsSubNav active="branches" />

        <MvNotice v-if="loadError" variant="error">{{ loadError }}</MvNotice>

        <MvPanel title="Warehouse assignment">
            <template #subheader>
                <p class="branch-settings-page__description">
                    Confirm which branch each warehouse belongs to and whether it counts toward that
                    branch's available-to-promise stock — 1C's own branch/isActive values are shown
                    as read-only reference and are not always reliable.
                </p>
            </template>

            <MvInput
                v-model="warehouseSearch"
                class="branch-settings-page__search"
                placeholder="Search warehouses by name or ERP id…"
            />
            <MvNotice v-if="reassignError" variant="error">{{ reassignError }}</MvNotice>
            <WarehouseCurationTable
                :warehouses="filteredWarehouses"
                :branches="branches"
                :loading="loading"
                :saving-warehouse-id="savingWarehouseId"
                @reassign="onReassign"
            />
        </MvPanel>

        <MvPanel title="Branch settings">
            <template #subheader>
                <p class="branch-settings-page__description">
                    Set defaults and visibility for the selected branch.
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
    max-width: 1000px;
}

.branch-settings-page__description {
    margin: 0;
    font-size: 13px;
    color: var(--el-text-color-secondary, #6b7280);
}

.branch-settings-page__search {
    margin-bottom: 12px;
}

.branch-settings-page__divider {
    height: 1px;
    margin: 14px 0;
    background: var(--el-border-color, #e4e7ec);
}

.branch-settings-page__breadcrumb {
    color: var(--el-text-color-secondary, #6b7280);
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
    color: var(--el-text-color-secondary, #6b7280);
}
</style>
