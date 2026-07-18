<script setup lang="ts">
import { ref } from 'vue';
import { MvModal } from '@mivend/ui-kit';
import {
    deleteTableView as deleteTableViewApi,
    fetchMyTableViews,
    saveTableView as saveTableViewApi,
    type SavedTableView,
} from '../../api/orders';

const props = defineProps<{
    pageKey: string;
    currentFilters: Record<string, string>;
    currentVisibleColumns: string[];
}>();
const emit = defineEmits<{ recall: [view: SavedTableView] }>();

const views = ref<SavedTableView[]>([]);
const showSaveModal = ref(false);
const newViewName = ref('');
const saving = ref(false);

async function load(): Promise<void> {
    views.value = await fetchMyTableViews(props.pageKey);
}

function openSaveModal(): void {
    newViewName.value = '';
    showSaveModal.value = true;
}

async function confirmSave(): Promise<void> {
    if (!newViewName.value.trim()) return;
    saving.value = true;
    try {
        await saveTableViewApi(
            props.pageKey,
            newViewName.value.trim(),
            JSON.stringify(props.currentFilters),
            props.currentVisibleColumns,
        );
        showSaveModal.value = false;
        await load();
    } finally {
        saving.value = false;
    }
}

function recall(view: SavedTableView): void {
    emit('recall', view);
}

async function remove(view: SavedTableView): Promise<void> {
    await deleteTableViewApi(view.id);
    await load();
}

defineExpose({ load });
load();
</script>

<template>
    <div class="my-table-views">
        <button type="button" class="my-table-views__save" @click="openSaveModal">
            + Save current view
        </button>

        <ul v-if="views.length" class="my-table-views__list">
            <li v-for="view in views" :key="view.id" class="my-table-views__item">
                <span class="my-table-views__name" @click="recall(view)">{{ view.name }}</span>
                <button
                    type="button"
                    class="my-table-views__delete"
                    aria-label="Delete saved view"
                    @click="remove(view)"
                >
                    ✕
                </button>
            </li>
        </ul>
        <p v-else class="my-table-views__empty">No custom saved views yet.</p>

        <MvModal v-if="showSaveModal" title="Save current view" @close="showSaveModal = false">
            <input
                v-model="newViewName"
                class="my-table-views__input"
                type="text"
                placeholder="View name"
                @keyup.enter="confirmSave"
            />
            <div class="my-table-views__modal-actions">
                <button type="button" class="my-table-views__cancel" @click="showSaveModal = false">
                    Cancel
                </button>
                <button
                    type="button"
                    class="my-table-views__confirm"
                    :disabled="saving || !newViewName.trim()"
                    @click="confirmSave"
                >
                    Save
                </button>
            </div>
        </MvModal>
    </div>
</template>

<style scoped>
.my-table-views {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.my-table-views__save {
    border: 1px dashed var(--el-border-color, #d1d5db);
    border-radius: var(--app-radius-md, 14px);
    background: transparent;
    padding: 8px 12px;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    color: var(--el-text-color-primary, #17212b);
}

.my-table-views__save:hover {
    background: var(--el-fill-color-light, #f8fafc);
}

.my-table-views__list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.my-table-views__item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 6px 10px;
    border-radius: var(--app-radius-md, 14px);
    background: var(--el-fill-color-lighter, #f3f8f6);
}

.my-table-views__name {
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    color: var(--el-text-color-primary, #17212b);
}

.my-table-views__delete {
    border: 0;
    background: transparent;
    cursor: pointer;
    color: var(--el-text-color-secondary, #6b7280);
    font-size: 11px;
}

.my-table-views__empty {
    font-size: 12px;
    color: var(--el-text-color-secondary, #6b7280);
    margin: 0;
}

.my-table-views__input {
    width: 100%;
    box-sizing: border-box;
    padding: 8px 10px;
    border: 1px solid var(--el-border-color, #e4e7ec);
    border-radius: 10px;
    font-size: 14px;
}

.my-table-views__modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 14px;
}

.my-table-views__cancel,
.my-table-views__confirm {
    border: 0;
    border-radius: 10px;
    padding: 8px 14px;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
}

.my-table-views__cancel {
    background: var(--el-fill-color-light, #f3f8f6);
    color: var(--el-text-color-primary, #17212b);
}

.my-table-views__confirm {
    background: var(--el-color-primary, #14231f);
    color: #fff;
}

.my-table-views__confirm:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}
</style>
