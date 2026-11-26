<script setup lang="ts">
import { ref } from 'vue';
import { useUiLabels } from '../../utils/uiLabels';
import MvSuggestInput from './MvSuggestInput.vue';
import { groupTokenId, groupTokenName } from './filterReference';
import type { SuggestFetcher } from './useSuggestions';
const uiLabel = useUiLabels();

// Picks several objects from a server lookup; only looked-up names can be added.
const props = defineProps<{
    modelValue: string[];
    suggest?: SuggestFetcher;
    testid?: string;
    // Values are group tokens (`id:path`): read as the path, unique by the id.
    group?: boolean;
}>();
const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>();

const text = ref('');

const same = (a: string, b: string): boolean =>
    props.group ? groupTokenId(a) === groupTokenId(b) : a === b;
const shown = (value: string): string => (props.group ? groupTokenName(value) : value);

function add(name: string): void {
    if (!props.modelValue.some(v => same(v, name))) {
        emit('update:modelValue', [...props.modelValue, name]);
    }
    text.value = '';
}
function remove(name: string): void {
    emit(
        'update:modelValue',
        props.modelValue.filter(v => v !== name),
    );
}
</script>

<template>
    <div class="mv-suggest-multi">
        <MvSuggestInput
            v-model="text"
            :suggest="suggest"
            :placeholder="uiLabel('searchToAdd', 'Search to add')"
            :testid="testid"
            :display="group ? groupTokenName : undefined"
            @pick="add"
        />
        <ul v-if="modelValue.length" class="mv-suggest-multi__picked">
            <li v-for="name in modelValue" :key="name" data-testid="filter-picked">
                <span>{{ shown(name) }}</span>
                <button
                    type="button"
                    :aria-label="uiLabel('remove', 'Remove')"
                    @click="remove(name)"
                >
                    ×
                </button>
            </li>
        </ul>
    </div>
</template>

<style scoped>
.mv-suggest-multi__picked {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin: 6px 0 0;
    padding: 0;
    list-style: none;
}

.mv-suggest-multi__picked li {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    border-radius: 8px;
    font-size: 12px;
    background: var(--el-color-primary-light-9);
    color: var(--el-text-color-primary);
    overflow-wrap: anywhere;
}

.mv-suggest-multi__picked button {
    border: 0;
    background: none;
    padding: 0;
    cursor: pointer;
    color: var(--el-text-color-secondary);
}
</style>
