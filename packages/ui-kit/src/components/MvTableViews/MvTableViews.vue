<script setup lang="ts">
import { useUiLabels } from '../../utils/uiLabels';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useIsMobileViewport } from '../../composables/useIsMobileViewport';
import { useAnchoredPanel } from '../../composables/useAnchoredPanel';
import { Collection } from '@element-plus/icons-vue';
import MvButton from '../MvButton/MvButton.vue';
import MvTableViewItem, { type TableViewItem } from './MvTableViewItem.vue';

export type { TableViewItem };
export type TableViewSaveScope = 'PERSONAL' | 'SHARED';

// Presentational "Views" menu for a table toolbar; the owner holds the storage and the table state.
// Team views (`shared`) can be applied by anyone; `canManageShared` unlocks editing them.
const label = useUiLabels();
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
const panelEl = ref<HTMLElement | null>(null);
const isMobile = useIsMobileViewport(640);
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
const panel = useAnchoredPanel({
    open,
    anchor: () => rootEl.value,
    width: 340,
    sheet: isMobile,
});
const panelPos = panel.style;
function onDocClick(e: MouseEvent): void {
    const target = e.target as Node;
    if (rootEl.value?.contains(target) || panelEl.value?.contains(target)) return;
    open.value = false;
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
            <span class="mv-table-views__label">{{ activeName || label('views', 'Views') }}</span>
            <span
                v-if="dirty"
                class="mv-table-views__dirty"
                :title="label('unsavedChanges', 'Unsaved changes')"
                >*</span
            >
        </MvButton>
        <Teleport to="body">
            <div v-if="open && isMobile" class="mv-table-views__backdrop" @click="open = false" />
            <div
                v-if="open"
                ref="panelEl"
                class="mv-table-views__panel"
                :class="{ 'mv-table-views__panel--sheet': isMobile }"
                :style="panelPos"
                role="menu"
                data-testid="table-views-panel"
            >
                <div class="mv-table-views__title">{{ label('views', 'Views') }}</div>
                <button
                    type="button"
                    class="mv-table-views__row"
                    :class="{ 'mv-table-views__row--active': !activeId }"
                    @click="pick('')"
                >
                    {{ label('defaultView', 'Default view') }}
                </button>
                <template
                    v-for="group in [
                        { key: 'mine', label: label('myViews', 'My views'), items: mine },
                        { key: 'team', label: label('teamViews', 'Team views'), items: team },
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
                    <div
                        v-if="activeId && dirty && canUpdateActive"
                        class="mv-table-views__actions"
                    >
                        <MvButton
                            size="sm"
                            variant="primary"
                            :disabled="busy"
                            @click="emit('update')"
                            >{{
                                label('update', 'Update "{name}"').replace(
                                    '{name}',
                                    () => activeName ?? '',
                                )
                            }}</MvButton
                        >
                        <MvButton size="sm" variant="ghost" @click="emit('reset')">{{
                            label('discard', 'Discard')
                        }}</MvButton>
                    </div>
                    <div class="mv-table-views__new">
                        <input
                            v-model="newName"
                            class="mv-table-views__input mv-table-views__name"
                            :placeholder="label('saveCurrentAs', 'Save current table as…')"
                            maxlength="80"
                            data-testid="table-views-name"
                            @keyup.enter="create"
                        />
                        <div class="mv-table-views__new-row">
                            <select
                                v-if="canManageShared"
                                v-model="newScope"
                                class="mv-table-views__input mv-table-views__scope"
                                data-testid="table-views-scope"
                            >
                                <option value="PERSONAL">{{ label('onlyMe', 'Only me') }}</option>
                                <option value="SHARED">{{ label('team', 'Team') }}</option>
                            </select>
                            <MvButton
                                size="sm"
                                variant="primary"
                                class="mv-table-views__save"
                                :disabled="busy || !newName.trim()"
                                data-testid="table-views-save"
                                @click="create"
                                >{{ label('save', 'Save') }}</MvButton
                            >
                        </div>
                    </div>
                </div>
            </div>
        </Teleport>
    </div>
</template>

<style scoped src="./MvTableViews.css"></style>
