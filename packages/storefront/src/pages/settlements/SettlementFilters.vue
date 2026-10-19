<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import {
    MvDatePicker,
    MvFilterChips,
    MvInput,
    MvSelect,
    resolveDateRangePreset,
} from '@mivend/ui-kit';
import type { DateRangeFilterValue, SelectOption } from '@mivend/ui-kit';
import { periodOptions as buildPeriodOptions, typeChips } from './settlementChips';
import { useDatePickerProps } from '../../composables/useDatePickerProps';

const props = defineProps<{
    chip: string;
    contract: string;
    organization: string;
    range: DateRangeFilterValue;
    search: string;
    contractOptions: SelectOption[];
    organizationOptions: SelectOption[];
}>();
const emit = defineEmits<{
    (e: 'update:chip' | 'update:contract' | 'update:organization', val: string): void;
    (e: 'update:search', val: string): void;
    (e: 'update:range', val: DateRangeFilterValue): void;
}>();

const { t } = useI18n();
const datePicker = useDatePickerProps();
const chips = computed(typeChips);
const periodOptions = computed(buildPeriodOptions);
const isCustom = computed(() => props.range.preset === 'custom');

function selectPreset(key: string): void {
    const { from, to } = key === 'custom' ? { from: '', to: '' } : resolveDateRangePreset(key);
    emit('update:range', { preset: key, from, to });
}

function setBound(bound: 'from' | 'to', value: string): void {
    emit('update:range', { ...props.range, preset: 'custom', [bound]: value });
}
</script>

<template>
    <div class="settlement-filters">
        <MvFilterChips :chips="chips" :active="chip" @select="$emit('update:chip', $event)" />
        <div class="settlement-filters__row">
            <label class="settlement-filters__field">
                <span>{{ t('settlements.filters.contract') }}</span>
                <MvSelect
                    :model-value="contract"
                    :options="contractOptions"
                    @update:model-value="$emit('update:contract', $event)"
                />
            </label>
            <label class="settlement-filters__field">
                <span>{{ t('settlements.filters.organization') }}</span>
                <MvSelect
                    :model-value="organization"
                    :options="organizationOptions"
                    @update:model-value="$emit('update:organization', $event)"
                />
            </label>
            <label class="settlement-filters__field">
                <span>{{ t('settlements.filters.period') }}</span>
                <MvSelect
                    :model-value="range.preset || 'all'"
                    :options="periodOptions"
                    @update:model-value="selectPreset"
                />
            </label>
            <label class="settlement-filters__field">
                <span>{{ t('settlements.filters.number') }}</span>
                <MvInput
                    size="sm"
                    :placeholder="t('settlements.filters.numberPlaceholder')"
                    :model-value="search"
                    @update:model-value="$emit('update:search', $event)"
                />
            </label>
        </div>
        <div v-if="isCustom" class="settlement-filters__row settlement-filters__row--dates">
            <div class="settlement-filters__field">
                <span>{{ t('settlements.filters.from') }}</span>
                <MvDatePicker
                    v-bind="datePicker"
                    :model-value="range.from"
                    @update:model-value="setBound('from', $event)"
                />
            </div>
            <div class="settlement-filters__field">
                <span>{{ t('settlements.filters.to') }}</span>
                <MvDatePicker
                    v-bind="datePicker"
                    :model-value="range.to"
                    @update:model-value="setBound('to', $event)"
                />
            </div>
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
    grid-template-columns: repeat(4, minmax(0, 1fr));
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

.settlement-filters__row--dates {
    grid-template-columns: repeat(2, minmax(0, 260px));
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
