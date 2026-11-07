<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { Collection } from '@element-plus/icons-vue';
import MvButton from '../MvButton/MvButton.vue';
import MvTableViewItem, { type TableViewItem } from './MvTableViewItem.vue';

export type { TableViewItem };
export type TableViewSaveScope = 'PERSONAL' | 'SHARED';

// Presentational "Views" menu for a table toolbar; the owner holds the storage and the table state.
// Team views (`shared`) can be applied by anyone; `canManageShared` unlocks editing them.
const props = defineProps<{
    views: TableViewItem[];
    activeId: string;
    // The table differs from the active view.
    dirty: boolean;
    busy?: boolean;
    canManageShared?: boolean;
}>();
const emit = defineEmits<{
    select: [id: string];
    reset: [];
    create: [name: string, scope: TableViewSaveScope];
    update: [];
    rename: [id: string, name: string];
    duplicate: [id: string];
    delete: [id: string];
    setDefault: [id: string, value: boolean];
}>();

const open = ref(false);
const rootEl = ref<HTMLElement | null>(null);
const newName = ref('');
const newScope = ref<TableViewSaveScope>('PERSONAL');

const active = computed(() => props.views.find(v => v.id === props.activeId));
const activeName = computed(() => active.value?.name ?? '');
const mine = computed(() => props.views.filter(v => !v.shared));
const team = computed(() => props.views.filter(v => v.shared));
const canUpdateActive = computed(
    () => !!active.value && (!active.value.shared || !!props.canManageShared),
);

function manageable(view: TableViewItem): boolean {
    return !view.shared || !!props.canManageShared;
}
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
    emit('create', name, props.canManageShared ? newScope.value : 'PERSONAL');
    newName.value = '';
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
            <template
                v-for="group in [
                    { key: 'mine', label: 'My views', items: mine },
                    { key: 'team', label: 'Team views', items: team },
                ]"
                :key="group.key"
            >
                <div
                    v-if="group.items.length"
                    class="mv-table-views__group"
                    :data-testid="`table-views-group-${group.key}`"
                >
                    {{ group.label }}
                </div>
                <MvTableViewItem
                    v-for="view in group.items"
                    :key="view.id"
                    :view="view"
                    :active="view.id === activeId"
                    :manageable="manageable(view)"
                    :busy="busy"
                    @pick="pick"
                    @rename="(id, name) => emit('rename', id, name)"
                    @duplicate="emit('duplicate', $event)"
                    @delete="emit('delete', $event)"
                    @set-default="(id, value) => emit('setDefault', id, value)"
                />
            </template>
            <div class="mv-table-views__footer">
                <div v-if="activeId && dirty && canUpdateActive" class="mv-table-views__actions">
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
                    <select
                        v-if="canManageShared"
                        v-model="newScope"
                        class="mv-table-views__input mv-table-views__scope"
                        data-testid="table-views-scope"
                    >
                        <option value="PERSONAL">Only me</option>
                        <option value="SHARED">Team</option>
                    </select>
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

.mv-table-views__group {
    margin-top: 6px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    color: var(--app-text-grey);
}

.mv-table-views__scope {
    flex: 0 0 auto;
    width: auto;
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
