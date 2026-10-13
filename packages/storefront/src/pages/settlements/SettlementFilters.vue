<script setup lang="ts">
import { MvColumnFilterDateRange, MvFilterChips, MvSelect } from '@mivend/ui-kit';
import type { DateRangeFilterValue, SelectOption } from '@mivend/ui-kit';
import { PERIOD_PRESETS, TYPE_CHIPS } from './settlementChips';

defineProps<{
    chip: string;
    contract: string;
    organization: string;
    range: DateRangeFilterValue;
    search: string;
    contractOptions: SelectOption[];
    organizationOptions: SelectOption[];
}>();
defineEmits<{
    (e: 'update:chip' | 'update:contract' | 'update:organization', val: string): void;
    (e: 'update:search', val: string): void;
    (e: 'update:range', val: DateRangeFilterValue): void;
}>();
</script>

<template>
    <div class="settlement-filters">
        <MvFilterChips :chips="TYPE_CHIPS" :active="chip" @select="$emit('update:chip', $event)" />
        <div class="settlement-filters__row">
            <label class="settlement-filters__field">
                <span>Contract</span>
                <MvSelect
                    :model-value="contract"
                    :options="contractOptions"
                    @update:model-value="$emit('update:contract', $event)"
                />
            </label>
            <label class="settlement-filters__field">
                <span>Organization</span>
                <MvSelect
                    :model-value="organization"
                    :options="organizationOptions"
                    @update:model-value="$emit('update:organization', $event)"
                />
            </label>
            <div class="settlement-filters__field settlement-filters__field--period">
                <span>Period</span>
                <MvColumnFilterDateRange
                    :config="{ type: 'date-range', presets: PERIOD_PRESETS }"
                    :model-value="range"
                    @update:model-value="$emit('update:range', $event)"
                />
            </div>
            <label class="settlement-filters__field settlement-filters__field--wide">
                <span>Document or order number</span>
                <input
                    class="settlement-filters__search"
                    placeholder="Enter a number"
                    :value="search"
                    @input="$emit('update:search', ($event.target as HTMLInputElement).value)"
                />
            </label>
        </div>
    </div>
</template>

<style scoped>
.settlement-filters {
    background: #fff;
    border: 1px solid rgba(221, 231, 226, 0.86);
    border-radius: 28px;
    box-shadow: 0 14px 36px rgba(27, 45, 38, 0.08);
    padding: 18px;
    display: grid;
    gap: 14px;
}

.settlement-filters__row {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr)) minmax(0, 1.6fr) minmax(0, 1.4fr);
    gap: 12px;
    align-items: end;
}

.settlement-filters__field {
    display: grid;
    gap: 6px;
    color: #66736e;
    font-size: 12px;
    font-weight: 800;
}

.settlement-filters__search {
    min-height: 40px;
    border: 1px solid #dde7e2;
    border-radius: 12px;
    padding: 0 12px;
    font-family: inherit;
    font-size: 14px;
    outline: none;
}

.settlement-filters__search:focus {
    border-color: #00a878;
}

@media (max-width: 1100px) {
    .settlement-filters__row {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }
}

@media (max-width: 560px) {
    .settlement-filters__row {
        grid-template-columns: 1fr;
    }
}
</style>
