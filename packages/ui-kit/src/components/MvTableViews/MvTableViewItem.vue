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
            maxlength="80"
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
            <span class="mv-table-views__name-text">{{ view.name }}</span>
            <span
                v-if="view.isDefault"
                class="mv-table-views__badge"
                data-testid="table-views-default"
                >Team default</span
            >
        </button>
        <div class="mv-table-views__acts">
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
    </div>
</template>

<style scoped src="./MvTableViewItem.css"></style>
