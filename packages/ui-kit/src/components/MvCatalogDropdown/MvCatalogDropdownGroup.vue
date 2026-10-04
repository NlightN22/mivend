<script setup lang="ts">
import { computed, ref } from 'vue';
import MvStatusTag from '../MvStatusTag/MvStatusTag.vue';

export interface CollectionNode {
    id: string;
    name: string;
    slug: string;
    iconUrl?: string | null;
    isHidden?: boolean;
    children: CollectionNode[];
}

const PREVIEW_LIMIT = 6;

const props = defineProps<{ group: CollectionNode; moreLabel: string; lessLabel: string; hiddenLabel: string }>();

const emit = defineEmits<{ close: [] }>();

const expanded = ref(false);
const items = computed(() => (expanded.value ? props.group.children : props.group.children.slice(0, PREVIEW_LIMIT)));

function categoryLink(slug: string): { path: string; query: { collection: string } } {
    return { path: '/catalog', query: { collection: slug } };
}
</script>

<template>
    <div class="mv-catalog-dropdown-group">
        <RouterLink class="mv-catalog-dropdown-group__title" :to="categoryLink(group.slug)" @click="emit('close')">
            {{ group.name }}
            <MvStatusTag v-if="group.isHidden" variant="unavailable" class="mv-catalog-dropdown-group__hidden" data-testid="category-hidden-marker">{{ hiddenLabel }}</MvStatusTag>
        </RouterLink>
        <RouterLink
            v-for="item in items"
            :key="item.id"
            class="mv-catalog-dropdown-group__sub"
            :to="categoryLink(item.slug)"
            @click="emit('close')"
        >
            {{ item.name }}
            <MvStatusTag v-if="item.isHidden" variant="unavailable" class="mv-catalog-dropdown-group__hidden" data-testid="category-hidden-marker">{{ hiddenLabel }}</MvStatusTag>
        </RouterLink>
        <button
            v-if="group.children.length > PREVIEW_LIMIT"
            type="button"
            class="mv-catalog-dropdown-group__more"
            @click="expanded = !expanded"
        >
            {{ expanded ? lessLabel : moreLabel }}
        </button>
    </div>
</template>

<style scoped>
.mv-catalog-dropdown-group {
    display: grid;
    gap: 2px;
}

.mv-catalog-dropdown-group__title {
    display: block;
    padding: 6px 10px;
    border-radius: 8px;
    font-size: 15px;
    font-weight: 850;
    color: var(--app-nav-text-strong);
    text-decoration: none;
}

.mv-catalog-dropdown-group__title:hover {
    color: var(--app-nav-accent);
    background: var(--app-nav-hover-bg);
}

.mv-catalog-dropdown-group__hidden {
    margin-left: 8px;
    padding: 0 6px;
    font-size: 11px;
    line-height: 16px;
}

.mv-catalog-dropdown-group__more {
    justify-self: start;
    min-height: 32px;
    padding: 0 10px;
    border: none;
    background: transparent;
    font-size: 13px;
    font-weight: 700;
    color: var(--app-nav-accent-soft);
    cursor: pointer;
    font-family: inherit;
}

.mv-catalog-dropdown-group__sub {
    display: flex;
    align-items: center;
    min-height: 32px;
    padding: 0 10px;
    border: none;
    background: transparent;
    text-decoration: none;
    text-align: left;
    font-size: 14px;
    color: var(--app-nav-text-muted);
    cursor: pointer;
    font-family: inherit;
    border-radius: 8px;
    transition: color 0.12s, background 0.12s;
}

.mv-catalog-dropdown-group__sub:hover {
    color: var(--app-nav-accent);
    background: var(--app-nav-hover-bg);
}
</style>
