<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useIsMobileViewport } from '../../composables/useIsMobileViewport';
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
const panelEl = ref<HTMLElement | null>(null);
const isMobile = useIsMobileViewport(640);
const panelPos = ref<Record<string, string>>({});
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
const PANEL_WIDTH = 340;
const GAP = 6;
const EDGE = 8;

function place(): void {
    const trigger = rootEl.value;
    if (!trigger || isMobile.value) {
        panelPos.value = {};
        return;
    }
    const r = trigger.getBoundingClientRect();
    const width = Math.min(PANEL_WIDTH, window.innerWidth - EDGE * 2);
    const left = Math.max(EDGE, Math.min(r.left, window.innerWidth - width - EDGE));
    const below = window.innerHeight - r.bottom - GAP - EDGE;
    const above = r.top - GAP - EDGE;
    const flip = below < 240 && above > below;
    panelPos.value = flip
        ? {
              left: `${left}px`,
              bottom: `${window.innerHeight - r.top + GAP}px`,
              width: `${width}px`,
              maxHeight: `${above}px`,
          }
        : {
              left: `${left}px`,
              top: `${r.bottom + GAP}px`,
              width: `${width}px`,
              maxHeight: `${below}px`,
          };
}
watch(open, async value => {
    if (!value) return;
    place();
    await nextTick();
    place();
});
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
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
});
onBeforeUnmount(() => {
    document.removeEventListener('click', onDocClick);
    document.removeEventListener('keydown', onEscape);
    window.removeEventListener('resize', place);
    window.removeEventListener('scroll', place, true);
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
                    <div
                        v-if="activeId && dirty && canUpdateActive"
                        class="mv-table-views__actions"
                    >
                        <MvButton
                            size="sm"
                            variant="primary"
                            :disabled="busy"
                            @click="emit('update')"
                            >Update "{{ activeName }}"</MvButton
                        >
                        <MvButton size="sm" variant="ghost" @click="emit('reset')"
                            >Discard</MvButton
                        >
                    </div>
                    <div class="mv-table-views__new">
                        <input
                            v-model="newName"
                            class="mv-table-views__input mv-table-views__name"
                            placeholder="Save current table as…"
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
                                <option value="PERSONAL">Only me</option>
                                <option value="SHARED">Team</option>
                            </select>
                            <MvButton
                                size="sm"
                                variant="primary"
                                class="mv-table-views__save"
                                :disabled="busy || !newName.trim()"
                                data-testid="table-views-save"
                                @click="create"
                                >Save</MvButton
                            >
                        </div>
                    </div>
                </div>
            </div>
        </Teleport>
    </div>
</template>

<style scoped src="./MvTableViews.css"></style>
