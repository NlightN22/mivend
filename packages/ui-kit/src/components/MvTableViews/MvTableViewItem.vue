<script setup lang="ts">
import { ref } from 'vue';

export interface TableViewItem {
    id: string;
    name: string;
    shared?: boolean;
    isDefault?: boolean;
}

// One row of the views menu; `manageable` hides the edit actions a person may not use on this view.
const props = defineProps<{
    view: TableViewItem;
    active: boolean;
    manageable: boolean;
    busy?: boolean;
}>();
const emit = defineEmits<{
    pick: [id: string];
    rename: [id: string, name: string];
    duplicate: [id: string];
    delete: [id: string];
    setDefault: [id: string, value: boolean];
}>();

const renaming = ref(false);
const renameValue = ref('');

function startRename(): void {
    renameValue.value = props.view.name;
    renaming.value = true;
}
function commitRename(): void {
    const name = renameValue.value.trim();
    if (name && name !== props.view.name) emit('rename', props.view.id, name);
    renaming.value = false;
}
</script>

<template>
    <div class="mv-table-views__item" :data-default="view.isDefault ? 'true' : undefined">
        <input
            v-if="renaming"
            v-model="renameValue"
            class="mv-table-views__input"
            data-testid="table-views-rename"
            @keyup.enter="commitRename"
            @keyup.escape="renaming = false"
        />
        <button
            v-else
            type="button"
            class="mv-table-views__row"
            :class="{ 'mv-table-views__row--active': active }"
            @click="emit('pick', view.id)"
        >
            {{ view.name }}
            <span
                v-if="view.isDefault"
                class="mv-table-views__badge"
                data-testid="table-views-default"
                >Team default</span
            >
        </button>
        <button
            v-if="manageable && view.shared"
            type="button"
            class="mv-table-views__act"
            :title="view.isDefault ? 'Clear team default' : 'Set as team default'"
            data-testid="table-views-toggle-default"
            :disabled="busy"
            @click="emit('setDefault', view.id, !view.isDefault)"
        >
            {{ view.isDefault ? 'Unset' : 'Default' }}
        </button>
        <button
            v-if="manageable"
            type="button"
            class="mv-table-views__act"
            title="Rename"
            :disabled="busy"
            @click="startRename"
        >
            Rename
        </button>
        <button
            type="button"
            class="mv-table-views__act"
            :title="view.shared ? 'Copy to my views' : 'Duplicate'"
            :disabled="busy"
            @click="emit('duplicate', view.id)"
        >
            Copy
        </button>
        <button
            v-if="manageable"
            type="button"
            class="mv-table-views__act mv-table-views__act--danger"
            title="Delete"
            :disabled="busy"
            @click="emit('delete', view.id)"
        >
            Delete
        </button>
    </div>
</template>

<style scoped>
.mv-table-views__item {
    display: flex;
    align-items: center;
    gap: 2px;
}

.mv-table-views__row {
    flex: 1;
    min-width: 0;
    text-align: left;
    border: 0;
    border-radius: 8px;
    padding: 6px 8px;
    background: transparent;
    color: var(--el-text-color-regular);
    font-size: 13px;
    cursor: pointer;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.mv-table-views__row:hover {
    background: var(--el-fill-color-light);
}

.mv-table-views__row--active {
    background: var(--el-color-primary-light-9);
    color: var(--el-color-primary-dark-2);
    font-weight: 700;
}

.mv-table-views__badge {
    margin-left: 6px;
    font-size: 10px;
    font-weight: 600;
    color: var(--app-text-grey);
}

.mv-table-views__act {
    border: 0;
    background: transparent;
    color: var(--app-text-grey);
    font-size: 11px;
    cursor: pointer;
    padding: 4px;
}

.mv-table-views__act:hover:not(:disabled) {
    color: var(--app-text-deep);
}

.mv-table-views__act--danger:hover:not(:disabled) {
    color: var(--app-danger-fg);
}

.mv-table-views__input {
    flex: 1;
    min-width: 0;
    box-sizing: border-box;
    padding: 6px 8px;
    border: 1px solid var(--el-border-color);
    border-radius: 8px;
    background: var(--app-surface);
    color: var(--el-text-color-regular);
    font-size: 13px;
}
</style>
