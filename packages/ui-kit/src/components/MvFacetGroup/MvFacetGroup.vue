<script setup lang="ts">
import { computed, ref } from 'vue';

export interface FacetGroupValue {
    id: string;
    name: string;
    count: number;
    iconUrl?: string | null;
}

const COLLAPSED_ROWS = 7;

const props = withDefaults(
    defineProps<{
        title: string;
        values: FacetGroupValue[];
        selected: Set<string>;
        showAllLabel?: string;
        collapseLabel?: string;
        clearLabel?: string;
        searchPlaceholder?: string;
        plain?: boolean;
    }>(),
    {
        showAllLabel: 'Show all',
        collapseLabel: 'Collapse',
        clearLabel: 'Clear selection',
        searchPlaceholder: 'Search',
    },
);

const emit = defineEmits<{ toggle: [id: string]; clear: [ids: string[]] }>();

const expanded = ref(false);
const search = ref('');

const canExpand = computed(() => props.values.length > COLLAPSED_ROWS);
const visible = computed(() => {
    if (!expanded.value) {
        return props.values.filter((v, i) => i < COLLAPSED_ROWS || props.selected.has(v.id));
    }
    const needle = search.value.trim().toLowerCase();
    return needle ? props.values.filter(v => v.name.toLowerCase().includes(needle)) : props.values;
});

const selectedIds = computed(() =>
    props.values.filter(v => props.selected.has(v.id)).map(v => v.id),
);

function collapse(): void {
    expanded.value = false;
    search.value = '';
}
</script>

<template>
    <div class="mv-facet-group">
        <h2 class="mv-facet-group__title">{{ title }}</h2>
        <input
            v-if="expanded"
            v-model="search"
            class="mv-facet-group__search"
            type="search"
            :placeholder="searchPlaceholder"
        />
        <div class="mv-facet-group__list" :class="{ 'mv-facet-group__list--scroll': expanded }">
            <label
                v-for="val in visible"
                :key="val.id"
                class="mv-facet-group__row"
                :class="{
                    'mv-facet-group__row--on': selected.has(val.id),
                    'mv-facet-group__row--plain': plain,
                }"
            >
                <input
                    class="mv-facet-group__check"
                    type="checkbox"
                    :checked="selected.has(val.id)"
                    @change="emit('toggle', val.id)"
                />
                <span v-if="!plain" class="mv-facet-group__icon">
                    <img v-if="val.iconUrl" :src="val.iconUrl" alt="" loading="lazy" />
                    <template v-else>{{ val.name.charAt(0).toUpperCase() }}</template>
                </span>
                <span class="mv-facet-group__name">{{ val.name }}</span>
                <span class="mv-facet-group__count">{{ val.count }}</span>
            </label>
        </div>
        <div v-if="canExpand || selectedIds.length > 0" class="mv-facet-group__actions">
            <button
                v-if="canExpand"
                type="button"
                class="mv-facet-group__toggle"
                @click="expanded ? collapse() : (expanded = true)"
            >
                {{ expanded ? collapseLabel : showAllLabel }}
            </button>
            <button
                v-if="selectedIds.length > 0"
                type="button"
                class="mv-facet-group__toggle mv-facet-group__clear"
                @click="emit('clear', selectedIds)"
            >
                {{ clearLabel }}
            </button>
        </div>
    </div>
</template>

<style scoped>
.mv-facet-group__title {
    margin: 0 0 10px;
    font-size: 11px;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #2c3b36;
}

.mv-facet-group__search {
    width: 100%;
    box-sizing: border-box;
    margin-bottom: 8px;
    padding: 8px 12px;
    border: 1.5px solid #dde7e2;
    border-radius: 10px;
    background: #f9fbfa;
    font-size: 14px;
    transition:
        border-color 0.15s,
        background 0.15s;
}

.mv-facet-group__search:focus {
    outline: none;
    border-color: #00b894;
    background: #fff;
}

.mv-facet-group__list--scroll {
    max-height: 280px;
    overflow-y: auto;
    margin: 0 -8px;
    padding: 0 8px;
}

.mv-facet-group__row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 5px 8px;
    margin: 0 -8px;
    border-radius: 10px;
    color: #43524d;
    font-size: 14px;
    cursor: pointer;
    transition:
        color 0.12s,
        background 0.12s;
}

.mv-facet-group__row:hover {
    color: var(--app-nav-accent, #008a64);
    background: var(--app-nav-hover-bg, #f3f7f5);
}

.mv-facet-group__check {
    position: absolute;
    opacity: 0;
    pointer-events: none;
}

.mv-facet-group__row--plain .mv-facet-group__check {
    position: static;
    flex: none;
    width: 16px;
    height: 16px;
    margin: 0;
    opacity: 1;
    pointer-events: auto;
    accent-color: #00b894;
    cursor: pointer;
}

.mv-facet-group__icon {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border: 1px solid #dde7e2;
    border-radius: 10px;
    background: #fff;
    font-weight: 800;
    color: #6b7c75;
    overflow: hidden;
    transition:
        border-color 0.12s,
        background 0.12s;
}

.mv-facet-group__icon img {
    width: 100%;
    height: 100%;
    object-fit: contain;
}

.mv-facet-group__row--on .mv-facet-group__icon,
.mv-facet-group__check:focus-visible + .mv-facet-group__icon {
    border: 2px solid #00b894;
    color: var(--app-nav-accent, #008a64);
}

.mv-facet-group__row--on,
.mv-facet-group__row--on:hover {
    color: var(--app-nav-accent, #008a64);
    background: var(--app-nav-active-bg, #e2f8ef);
}

.mv-facet-group__row--on .mv-facet-group__name {
    font-weight: 700;
}

.mv-facet-group__name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.mv-facet-group__count {
    color: #8a9a94;
    font-size: 12px;
}

.mv-facet-group__actions {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    margin-top: 6px;
}

.mv-facet-group__clear {
    color: #8a9a94;
}

.mv-facet-group__toggle {
    margin-top: 0;
    padding: 0;
    border: 0;
    background: none;
    color: #00997a;
    font-weight: 700;
    font-size: 14px;
    cursor: pointer;
}

.mv-facet-group__toggle:hover {
    text-decoration: underline;
}
</style>
