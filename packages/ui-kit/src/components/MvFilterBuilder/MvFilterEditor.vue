<script setup lang="ts">
import { computed, ref } from 'vue';
import MvButton from '../MvButton/MvButton.vue';
import MvDateField from '../MvDateField/MvDateField.vue';
import MvInput from '../MvInput/MvInput.vue';
import MvMultiSelect from '../MvMultiSelect/MvMultiSelect.vue';
import MvSelect from '../MvSelect/MvSelect.vue';
import type {
    FilterColumn,
    FilterCondition,
    FilterOperator,
    FilterValue,
} from './filterBuilderTypes';
import {
    emptyValueFor,
    isValueComplete,
    operatorLabel,
    operatorValueKind,
    operatorsFor,
} from './filterOperators';

// "Filter by <column>": operator select, a value input of the column's kind, and Apply.
const props = defineProps<{ column: FilterColumn; initial?: FilterCondition }>();
const emit = defineEmits<{ apply: [condition: FilterCondition]; back: [] }>();

const operators = computed(() => operatorsFor(props.column));
const operator = ref<FilterOperator>(props.initial?.operator ?? operators.value[0]!);
const value = ref<FilterValue>(props.initial?.value ?? emptyValueFor(operator.value));

const kind = computed(() => operatorValueKind(operator.value));
const canApply = computed(() => isValueComplete(operator.value, value.value));
const operatorOptions = computed(() =>
    operators.value.map(op => ({ value: op, label: operatorLabel(props.column, op) })),
);
const selectOptions = computed(() => [
    { value: '', label: 'Select…' },
    ...(props.column.options ?? []),
]);
const inputType = computed(() => (props.column.type === 'number' ? 'number' : 'text'));

function onOperator(next: string): void {
    const previous = kind.value;
    operator.value = next as FilterOperator;
    if (operatorValueKind(operator.value) !== previous) value.value = emptyValueFor(operator.value);
}
function setPart(index: number, part: string): void {
    const next = Array.isArray(value.value) ? [...value.value] : ['', ''];
    next[index] = part;
    value.value = next;
}
function apply(): void {
    if (canApply.value)
        emit('apply', {
            columnKey: props.column.key,
            operator: operator.value,
            value: kind.value === 'none' ? '' : value.value,
        });
}
</script>

<template>
    <form class="mv-filter-editor" data-testid="filter-editor" @submit.prevent="apply">
        <div class="mv-filter-editor__title">
            <button
                v-if="!initial"
                type="button"
                class="mv-filter-editor__back"
                aria-label="Back to columns"
                @click="emit('back')"
            >
                ‹
            </button>
            Filter by {{ column.label }}
        </div>
        <MvSelect
            :model-value="operator"
            :options="operatorOptions"
            data-testid="filter-operator"
            @update:model-value="onOperator"
        />
        <template v-if="kind === 'single'">
            <MvDateField
                v-if="column.type === 'date'"
                :model-value="value as string"
                @update:model-value="value = $event"
            />
            <MvSelect
                v-else-if="column.type === 'select'"
                :model-value="value as string"
                :options="selectOptions"
                data-testid="filter-value"
                @update:model-value="value = $event"
            />
            <MvInput
                v-else
                :model-value="value as string"
                :type="inputType"
                :inputmode="column.type === 'number' ? 'numeric' : 'text'"
                size="sm"
                placeholder="Value"
                data-testid="filter-value"
                @update:model-value="value = $event"
            />
        </template>
        <template v-else-if="kind === 'range'">
            <label class="mv-filter-editor__part">
                <span>From</span>
                <MvDateField
                    v-if="column.type === 'date'"
                    :model-value="(value as string[])[0] ?? ''"
                    @update:model-value="setPart(0, $event)"
                />
                <MvInput
                    v-else
                    :model-value="(value as string[])[0] ?? ''"
                    :type="inputType"
                    size="sm"
                    data-testid="filter-value-from"
                    @update:model-value="setPart(0, $event)"
                />
            </label>
            <label class="mv-filter-editor__part">
                <span>To</span>
                <MvDateField
                    v-if="column.type === 'date'"
                    :model-value="(value as string[])[1] ?? ''"
                    @update:model-value="setPart(1, $event)"
                />
                <MvInput
                    v-else
                    :model-value="(value as string[])[1] ?? ''"
                    :type="inputType"
                    size="sm"
                    data-testid="filter-value-to"
                    @update:model-value="setPart(1, $event)"
                />
            </label>
        </template>
        <MvMultiSelect
            v-else-if="kind === 'multi'"
            :model-value="value as string[]"
            :options="column.options ?? []"
            data-testid="filter-value"
            @update:model-value="value = $event"
        />
        <MvButton size="sm" variant="primary" native-type="submit" :disabled="!canApply">
            Apply filter
        </MvButton>
    </form>
</template>

<style scoped>
.mv-filter-editor {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.mv-filter-editor__title {
    font-size: 13px;
    font-weight: 600;
    color: var(--app-nav-text-strong);
}

.mv-filter-editor__back {
    border: 0;
    background: none;
    padding: 0 6px 0 0;
    font-size: 16px;
    line-height: 1;
    color: var(--el-text-color-secondary);
    cursor: pointer;
}

.mv-filter-editor__part {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 12px;
    color: var(--el-text-color-secondary);
}
</style>
