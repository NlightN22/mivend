<script setup lang="ts">
import { computed } from 'vue';
import { MvFilterBar, MvFilterField, MvInput, MvSelect } from '@mivend/ui-kit';
import type { CatalogFilters, FacetValueOption } from '../../api/catalog';

const props = defineProps<{
    filters: CatalogFilters;
    categories: FacetValueOption[];
    brands: FacetValueOption[];
}>();
const emit = defineEmits<{ 'update:filters': [filters: CatalogFilters]; reset: [] }>();

function update(patch: Partial<CatalogFilters>): void {
    emit('update:filters', { ...props.filters, ...patch });
}

const categoryOptions = computed(() => [
    { value: '', label: 'All categories' },
    ...props.categories.map(c => ({ value: c.id, label: c.name })),
]);
const brandOptions = computed(() => [
    { value: '', label: 'All brands' },
    ...props.brands.map(b => ({ value: b.id, label: b.name })),
]);
</script>

<template>
    <MvFilterBar @reset="emit('reset')">
        <MvFilterField label="Search">
            <MvInput
                size="sm"
                :model-value="filters.search"
                placeholder="Search by name, SKU, OEM code, or paste a VIN"
                @update:model-value="update({ search: $event })"
            />
        </MvFilterField>
        <MvFilterField label="Category">
            <MvSelect
                :model-value="filters.categoryValueId"
                :options="categoryOptions"
                @update:model-value="update({ categoryValueId: $event })"
            />
        </MvFilterField>
        <MvFilterField label="Brand">
            <MvSelect
                :model-value="filters.brandValueId"
                :options="brandOptions"
                @update:model-value="update({ brandValueId: $event })"
            />
        </MvFilterField>
    </MvFilterBar>
</template>
