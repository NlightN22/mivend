<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import {
    MvAdvancedDataTable,
    MvSelect,
    MvStatusBadge,
    useDataTableState,
    type AdvancedDataTableColumn,
    type SelectOption,
    type StatusBadgeVariant,
} from '@mivend/ui-kit';
import {
    describeCategoryVisibility,
    type CategoryVisibilityCollection,
} from '../../api/categoryVisibility';
import { buildCategoryTreeRows } from '../../utils/categoryVisibilityTree';

// Client-side search over a bounded list; `isPrivate` is the current state, `visibilityOverride` the editable one.
const { t } = useI18n();
const props = defineProps<{
    collections: CategoryVisibilityCollection[];
    loading: boolean;
    savingCollectionId: string | null;
    administratorId: string;
}>();

const emit = defineEmits<{
    setOverride: [payload: { id: string; visibilityOverride: string | null }];
}>();

const overrideOptions = computed<SelectOption[]>(() => [
    { value: '', label: t('settingsAccess.categories.override.auto') },
    { value: 'visible', label: t('settingsAccess.categories.override.visible') },
    { value: 'hidden', label: t('settingsAccess.categories.override.hidden') },
]);

const hiddenByParent = computed(() => t('settingsAccess.categories.hiddenByParent'));
const lockedOptions = computed<SelectOption[]>(() =>
    overrideOptions.value.filter(o => o.value !== 'visible'),
);
const staleVisibleOptions = computed<SelectOption[]>(() =>
    overrideOptions.value.map(o =>
        o.value === 'visible'
            ? { ...o, label: t('settingsAccess.categories.override.visibleIgnored') }
            : o,
    ),
);

function optionsFor(row: {
    hiddenByAncestor: boolean;
    visibilityOverride: string;
}): SelectOption[] {
    if (!row.hiddenByAncestor) return overrideOptions.value;
    return row.visibilityOverride === 'visible' ? staleVisibleOptions.value : lockedOptions.value;
}

const ALL_COLUMNS = computed<AdvancedDataTableColumn[]>(() => [
    {
        field: 'name',
        header: t('settingsAccess.categories.columns.category'),
        width: 340,
        required: true,
        filterConfig: { type: 'text', placeholder: t('settingsAccess.categories.filters.name') },
        mobile: { primary: true },
    },
    {
        field: 'slug',
        header: t('settingsAccess.categories.columns.slug'),
        width: 140,
        filterConfig: { type: 'none' },
        mobile: { hidden: true },
    },
    {
        field: 'isPrivate',
        header: t('settingsAccess.categories.columns.visibility'),
        width: 160,
        filterConfig: { type: 'none' },
    },
    {
        field: 'hiddenReason',
        header: t('settingsAccess.categories.columns.hiddenReason'),
        width: 160,
        filterConfig: { type: 'none' },
        mobile: { hidden: true },
    },
    {
        field: 'visibilityOverride',
        header: t('settingsAccess.categories.columns.override'),
        width: 200,
        filterConfig: { type: 'none' },
    },
]);

interface CategoryVisibilityFilterState {
    [key: string]: unknown;
    name: string;
}
const BLANK_FILTERS: CategoryVisibilityFilterState = { name: '' };

const { state: tableState } = useDataTableState<CategoryVisibilityFilterState>(
    `category-visibility-curation-datatable:${props.administratorId || 'anonymous'}`,
    {
        columnOrder: ALL_COLUMNS.value.map(c => c.field),
        columnWidths: Object.fromEntries(ALL_COLUMNS.value.map(c => [c.field, c.width])),
        hiddenColumns: [],
        sort: [],
        filters: BLANK_FILTERS,
        pageSize: 25,
    },
    {
        columns: ALL_COLUMNS.value,
        allowedFilterKeys: ALL_COLUMNS.value
            .filter(c => c.filterConfig.type !== 'none')
            .map(c => c.field),
    },
);

interface CategoryVisibilityRow {
    [key: string]: unknown;
    id: string;
    name: string;
    slug: string;
    depth: number;
    hasChildren: boolean;
    expanded: boolean;
    hiddenReason: string;
    hiddenByAncestor: boolean;
    isPrivate: boolean;
    isPrivateVariant: StatusBadgeVariant;
    visibilityOverride: string;
}
const visibilityInfo = computed(() => describeCategoryVisibility(props.collections));
const expandedIds = ref(new Set<string>());
function toggle(id: string): void {
    const next = new Set(expandedIds.value);
    if (!next.delete(id)) next.add(id);
    expandedIds.value = next;
}
function hiddenReasonLabel(reason: string): string {
    return reason ? t(`settingsAccess.categories.reason.${reason}`) : '—';
}
const rows = computed<CategoryVisibilityRow[]>(() =>
    buildCategoryTreeRows(
        props.collections,
        expandedIds.value,
        tableState.value.filters.name ?? '',
    ).map(({ item: c, depth, hasChildren, expanded }) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        depth,
        hasChildren,
        expanded,
        hiddenReason: hiddenReasonLabel(visibilityInfo.value.get(c.id)?.hiddenReason ?? ''),
        hiddenByAncestor: visibilityInfo.value.get(c.id)?.hiddenByAncestor ?? false,
        isPrivate: c.isPrivate,
        isPrivateVariant: c.isPrivate ? 'neutral' : 'success',
        visibilityOverride: c.customFields?.visibilityOverride ?? '',
    })),
);
</script>

<template>
    <MvAdvancedDataTable
        v-model:table-state="tableState"
        :columns="ALL_COLUMNS"
        :rows="rows"
        :loading="loading"
        :total-items="rows.length"
        :page="1"
        data-key="id"
        :row-height-px="49"
        :header-height-px="65"
        :default-filters="BLANK_FILTERS"
        :search="{ filterKey: 'name', placeholder: t('settingsAccess.categories.search') }"
        :empty-message="t('settingsAccess.categories.empty')"
    >
        <template #cell-name="{ data }">
            <span
                class="category-tree__name"
                :style="{ paddingLeft: `${(data as CategoryVisibilityRow).depth * 20}px` }"
            >
                <button
                    v-if="(data as CategoryVisibilityRow).hasChildren"
                    type="button"
                    class="category-tree__toggle"
                    :aria-expanded="(data as CategoryVisibilityRow).expanded"
                    :aria-label="
                        (data as CategoryVisibilityRow).expanded
                            ? t('settingsAccess.categories.collapse')
                            : t('settingsAccess.categories.expand')
                    "
                    @click="toggle((data as CategoryVisibilityRow).id)"
                >
                    {{ (data as CategoryVisibilityRow).expanded ? '▾' : '▸' }}
                </button>
                <span v-else class="category-tree__toggle" />
                {{ (data as CategoryVisibilityRow).name }}
            </span>
        </template>
        <template #cell-isPrivate="{ data }">
            <MvStatusBadge :variant="(data as CategoryVisibilityRow).isPrivateVariant">
                {{
                    (data as CategoryVisibilityRow).isPrivate
                        ? t('settingsAccess.categories.override.hidden')
                        : t('settingsAccess.categories.override.visible')
                }}
            </MvStatusBadge>
        </template>
        <template #cell-visibilityOverride="{ data }">
            <MvSelect
                :title="
                    (data as CategoryVisibilityRow).hiddenByAncestor ? hiddenByParent : undefined
                "
                :model-value="(data as CategoryVisibilityRow).visibilityOverride"
                :options="optionsFor(data as CategoryVisibilityRow)"
                :disabled="savingCollectionId === (data as CategoryVisibilityRow).id"
                @update:model-value="
                    (value: string) =>
                        emit('setOverride', {
                            id: (data as CategoryVisibilityRow).id,
                            visibilityOverride: value === '' ? null : value,
                        })
                "
            />
        </template>
    </MvAdvancedDataTable>
</template>

<style scoped>
.category-tree__name {
    display: inline-flex;
    align-items: center;
    gap: 6px;
}

.category-tree__toggle {
    width: 22px;
    height: 22px;
    padding: 0;
    border: 0;
    background: none;
    color: var(--el-text-color-secondary);
    cursor: pointer;
}
</style>
