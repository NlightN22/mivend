<script setup lang="ts">
// Backoffice multi-value picker — checkbox list rather than a native <select multiple> (which is
// hard to scan/use for more than a handful of options). Same option shape as MvSelect; above
// SEARCHABLE_OPTION_COUNT options a search box narrows the list, selections stay when it changes.
import { computed, ref } from 'vue';
import { useUiLabels } from '../../utils/uiLabels';
import {
    SEARCHABLE_OPTION_COUNT,
    filterOptionsByQuery,
} from '../MvColumnFilter/filterOptionsByQuery';
import type { SelectOption } from '../MvSelect/MvSelect.vue';
const uiLabel = useUiLabels();

const props = defineProps<{ modelValue: string[]; options: SelectOption[] }>();
const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>();

const query = ref('');
const searchable = computed(() => props.options.length > SEARCHABLE_OPTION_COUNT);
const visible = computed(() => filterOptionsByQuery(props.options, query.value));

function toggle(value: string): void {
    const next = props.modelValue.includes(value)
        ? props.modelValue.filter(v => v !== value)
        : [...props.modelValue, value];
    emit('update:modelValue', next);
}
</script>

<template>
    <div class="mv-multi-select">
        <input
            v-if="searchable"
            v-model="query"
            type="text"
            class="mv-multi-select__search"
            autocomplete="off"
            :placeholder="uiLabel('searchPlaceholder', 'Search…')"
            data-testid="multi-select-search"
        />
        <label v-for="option in visible" :key="option.value" class="mv-multi-select__option">
            <input
                type="checkbox"
                :checked="modelValue.includes(option.value)"
                @change="toggle(option.value)"
            />
            <span>{{ option.label }}</span>
        </label>
        <p v-if="!visible.length" class="mv-multi-select__empty" data-testid="multi-select-empty">
            {{ uiLabel('noResults', 'Nothing found') }}
        </p>
    </div>
</template>

<style scoped>
.mv-multi-select {
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-height: 160px;
    overflow-y: auto;
    padding: 8px 10px;
    border: 1px solid var(--el-border-color);
    border-radius: var(--app-radius-md, 12px);
    background: var(--el-fill-color-light);
}

.mv-multi-select__search {
    position: sticky;
    top: 0;
    height: 30px;
    padding: 0 8px;
    border: 1px solid var(--el-border-color);
    border-radius: 6px;
    background: var(--app-surface);
    font-size: 13px;
    color: var(--el-text-color-primary);
}

.mv-multi-select__empty {
    margin: 0;
    font-size: 13px;
    color: var(--el-text-color-secondary);
}

.mv-multi-select__option {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    font-weight: 400;
    text-transform: none;
    letter-spacing: normal;
    color: var(--el-text-color-primary);
    cursor: pointer;
}
</style>
