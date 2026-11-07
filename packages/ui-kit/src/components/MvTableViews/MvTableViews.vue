<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { Collection } from '@element-plus/icons-vue';
import MvButton from '../MvButton/MvButton.vue';

export interface TableViewItem {
    id: string;
    name: string;
}

// Presentational "Views" menu for a table toolbar; the owner holds the storage and the table state.
const props = defineProps<{
    views: TableViewItem[];
    activeId: string;
    // The table differs from the active view.
    dirty: boolean;
    busy?: boolean;
}>();
const emit = defineEmits<{
    select: [id: string];
    reset: [];
    create: [name: string];
    update: [];
    rename: [id: string, name: string];
    duplicate: [id: string];
    delete: [id: string];
}>();

const open = ref(false);
const rootEl = ref<HTMLElement | null>(null);
const newName = ref('');
const renamingId = ref('');
const renameValue = ref('');

const activeName = computed(() => props.views.find(v => v.id === props.activeId)?.name ?? '');

function onDocClick(e: MouseEvent): void {
    if (rootEl.value && !rootEl.value.contains(e.target as Node)) open.value = false;
}
function onEscape(e: KeyboardEvent): void {
    if (e.key === 'Escape') open.value = false;
}
onMounted(() => {
    document.addEventListener('click', onDocClick);
    document.addEventListener('keydown', onEscape);
});
onBeforeUnmount(() => {
    document.removeEventListener('click', onDocClick);
    document.removeEventListener('keydown', onEscape);
});

function create(): void {
    const name = newName.value.trim();
    if (!name) return;
    emit('create', name);
    newName.value = '';
}
function startRename(view: TableViewItem): void {
    renamingId.value = view.id;
    renameValue.value = view.name;
}
function commitRename(): void {
    const name = renameValue.value.trim();
    if (name && renamingId.value) emit('rename', renamingId.value, name);
    renamingId.value = '';
}
function pick(id: string): void {
    emit('select', id);
    open.value = false;
}
</script>

<template>
    <div ref="rootEl" class="mv-table-views" data-testid="table-views">
        <MvButton
            size="sm"
            variant="ghost"
            data-testid="table-views-trigger"
            :aria-expanded="open"
            @click="open = !open"
        >
            <Collection class="mv-table-views__icon" />
            <span class="mv-table-views__label">{{ activeName || 'Views' }}</span>
            <span v-if="dirty" class="mv-table-views__dirty" title="Unsaved changes">*</span>
        </MvButton>
        <div v-if="open" class="mv-table-views__panel" role="menu">
            <div class="mv-table-views__title">Views</div>
            <button
                type="button"
                class="mv-table-views__row"
                :class="{ 'mv-table-views__row--active': !activeId }"
                @click="pick('')"
            >
                Default view
            </button>
            <div v-for="view in views" :key="view.id" class="mv-table-views__item">
                <input
                    v-if="renamingId === view.id"
                    v-model="renameValue"
                    class="mv-table-views__input"
                    data-testid="table-views-rename"
                    @keyup.enter="commitRename"
                    @keyup.escape="renamingId = ''"
                />
                <button
                    v-else
                    type="button"
                    class="mv-table-views__row"
                    :class="{ 'mv-table-views__row--active': view.id === activeId }"
                    @click="pick(view.id)"
                >
                    {{ view.name }}
                </button>
                <button
                    type="button"
                    class="mv-table-views__act"
                    title="Rename"
                    :disabled="busy"
                    @click="startRename(view)"
                >
                    Rename
                </button>
                <button
                    type="button"
                    class="mv-table-views__act"
                    title="Duplicate"
                    :disabled="busy"
                    @click="emit('duplicate', view.id)"
                >
                    Copy
                </button>
                <button
                    type="button"
                    class="mv-table-views__act mv-table-views__act--danger"
                    title="Delete"
                    :disabled="busy"
                    @click="emit('delete', view.id)"
                >
                    Delete
                </button>
            </div>
            <div class="mv-table-views__footer">
                <div v-if="activeId && dirty" class="mv-table-views__actions">
                    <MvButton size="sm" variant="primary" :disabled="busy" @click="emit('update')"
                        >Update "{{ activeName }}"</MvButton
                    >
                    <MvButton size="sm" variant="ghost" @click="emit('reset')">Discard</MvButton>
                </div>
                <div class="mv-table-views__new">
                    <input
                        v-model="newName"
                        class="mv-table-views__input"
                        placeholder="Save current table as…"
                        data-testid="table-views-name"
                        @keyup.enter="create"
                    />
                    <MvButton
                        size="sm"
                        variant="primary"
                        :disabled="busy || !newName.trim()"
                        data-testid="table-views-save"
                        @click="create"
                        >Save</MvButton
                    >
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.mv-table-views {
    position: relative;
    display: inline-block;
}

.mv-table-views__icon {
    width: 15px;
    height: 15px;
}

.mv-table-views__label {
    margin-left: 6px;
    max-width: 140px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.mv-table-views__dirty {
    margin-left: 2px;
    color: var(--app-warn-fg);
    font-weight: 800;
}

.mv-table-views__panel {
    position: absolute;
    right: 0;
    top: calc(100% + 6px);
    z-index: var(--mv-z-dropdown);
    width: 320px;
    max-width: calc(100vw - 32px);
    padding: 12px;
    background: var(--app-surface);
    border: 1px solid var(--el-border-color);
    border-radius: 10px;
    box-shadow: 0 10px 30px var(--app-ink-10);
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.mv-table-views__title {
    font-size: 13px;
    font-weight: 600;
    color: var(--app-nav-text-strong);
}

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

.mv-table-views__footer {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 6px;
    padding-top: 8px;
    border-top: 1px solid var(--el-border-color);
}

.mv-table-views__actions,
.mv-table-views__new {
    display: flex;
    gap: 6px;
    align-items: center;
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
