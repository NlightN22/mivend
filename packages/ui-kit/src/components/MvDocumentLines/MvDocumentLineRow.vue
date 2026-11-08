<script setup lang="ts" generic="R extends DocRow">
import { computed } from 'vue';
import MvCheckbox from '../MvCheckbox/MvCheckbox.vue';
import MvDocumentCell from './MvDocumentCell.vue';
import MvDocumentLineActions from './MvDocumentLineActions.vue';
import {
    columnCount,
    rowStripe,
    visibleColumns,
    type DocColumn,
    type DocRow,
} from './documentLinesModel';

const props = defineProps<{
    row: R;
    columns: DocColumn[];
    selectable: boolean;
    actionable: boolean;
    selected: boolean;
    editing: boolean;
    saving: boolean;
    busy: boolean;
    canEdit: boolean;
    canRemove: boolean;
    error?: string;
}>();
defineEmits<{
    toggle: [];
    start: [];
    commit: [];
    cancel: [];
    remove: [];
    'flag-action': [column: string, action: string];
}>();

const stripe = computed(() => rowStripe(props.row.flags));
</script>

<template>
    <tr
        class="doc-row"
        :class="[
            `doc-row--${stripe}`,
            { 'doc-row--editing': editing, 'doc-row--selected': selected },
        ]"
        :data-testid="row.testId"
    >
        <td v-if="selectable" class="doc-row__select">
            <MvCheckbox
                :model-value="selected"
                :aria-label="`Select ${row.testId ?? row.id}`"
                @update:model-value="$emit('toggle')"
            />
        </td>
        <td
            v-for="(col, i) in visibleColumns(columns)"
            :key="col.key"
            class="doc-row__cell"
            :class="{ 'doc-row__cell--lead': i === 0 }"
            :data-label="col.label"
        >
            <MvDocumentCell
                :flag="editing && col.inputWhenEditing ? undefined : row.flags?.[col.key]"
                @action="$emit('flag-action', col.key, $event)"
            >
                <slot :name="`cell-${col.key}`" :row="row" :editing="editing" />
            </MvDocumentCell>
        </td>
        <td v-if="actionable" class="doc-row__actions">
            <MvDocumentLineActions
                :editing="editing"
                :saving="saving"
                :busy="busy"
                :can-edit="canEdit"
                :can-remove="canRemove"
                @start="$emit('start')"
                @commit="$emit('commit')"
                @cancel="$emit('cancel')"
                @remove="$emit('remove')"
            />
        </td>
    </tr>
    <tr v-if="error" class="doc-row__error-row">
        <td :colspan="columnCount(columns, selectable, actionable)" class="doc-row__error">
            {{ error }}
        </td>
    </tr>
</template>

<style scoped src="./MvDocumentLineRow.css"></style>
