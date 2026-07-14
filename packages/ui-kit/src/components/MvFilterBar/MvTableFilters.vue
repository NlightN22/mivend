<script setup lang="ts">
import MvFilterBar from './MvFilterBar.vue';
import MvFilterField from './MvFilterField.vue';
import MvInput from '../MvInput/MvInput.vue';
import MvSelect, { type SelectOption } from '../MvSelect/MvSelect.vue';

// Declarative field definitions a page hands over (usually alongside its table column
// definitions, so both stay in sync) instead of hand-wiring one MvFilterField per filter.
// The bar only owns rendering + emitting the flat value record — pages still own resolving
// select `options` (managers/branches/request types) and applying the filter to their data.
export interface TableFilterFieldDef {
    key: string;
    label: string;
    type: 'search' | 'select';
    placeholder?: string;
    options?: SelectOption[];
}

// `suggestions` (optional) populates a native <datalist> per 'search' field — see
// deriveFilterSuggestions() in tableFilterMatch.ts, which pages should use to compute this from
// their own row set rather than hand-listing values.
withDefaults(
    defineProps<{
        fields: TableFilterFieldDef[];
        modelValue: Record<string, string>;
        suggestions?: Record<string, string[]>;
    }>(),
    { suggestions: () => ({}) },
);
const emit = defineEmits<{ 'update:modelValue': [value: Record<string, string>]; reset: [] }>();

function update(key: string, value: string, current: Record<string, string>): void {
    emit('update:modelValue', { ...current, [key]: value });
}
</script>

<template>
    <MvFilterBar @reset="emit('reset')">
        <MvFilterField v-for="field in fields" :key="field.key" :label="field.label">
            <template v-if="field.type === 'search'">
                <MvInput
                    size="sm"
                    :model-value="modelValue[field.key] ?? ''"
                    :placeholder="field.placeholder"
                    :list="suggestions[field.key]?.length ? `${field.key}-suggestions` : undefined"
                    @update:model-value="update(field.key, $event, modelValue)"
                />
                <datalist v-if="suggestions[field.key]?.length" :id="`${field.key}-suggestions`">
                    <option v-for="value in suggestions[field.key]" :key="value" :value="value" />
                </datalist>
            </template>
            <MvSelect
                v-else
                :model-value="modelValue[field.key] ?? ''"
                :options="field.options ?? []"
                @update:model-value="update(field.key, $event, modelValue)"
            />
        </MvFilterField>
    </MvFilterBar>
</template>
