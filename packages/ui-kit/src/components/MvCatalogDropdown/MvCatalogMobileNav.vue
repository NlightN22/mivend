<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { IconCategory, IconChevronLeft, IconChevronRight, IconX } from '@tabler/icons-vue';
import MvStatusTag from '../MvStatusTag/MvStatusTag.vue';
import type { CollectionNode } from './MvCatalogDropdownGroup.vue';
import { resolveDrill } from './catalogDrill';

const props = defineProps<{
    collections: CollectionNode[];
    open: boolean;
    titleLabel: string;
    backLabel: string;
    allLabel: string;
    closeLabel: string;
    hiddenLabel: string;
}>();
const emit = defineEmits<{ close: [] }>();

const path = ref<string[]>([]);
const level = computed(() => resolveDrill(props.collections, path.value));
const current = computed(() => level.value.trail[level.value.trail.length - 1] ?? null);

watch(
    () => props.open,
    () => {
        path.value = [];
    },
);

function categoryLink(slug: string): { path: string; query: { collection: string } } {
    return { path: '/catalog', query: { collection: slug } };
}
</script>

<template>
    <div class="mv-catalog-mobile">
        <div class="mv-catalog-mobile__head">
            <button
                v-if="current"
                type="button"
                class="mv-catalog-mobile__back"
                :aria-label="backLabel"
                @click="path = path.slice(0, -1)"
            >
                <IconChevronLeft :size="20" aria-hidden="true" />
                <span>{{ backLabel }}</span>
            </button>
            <p class="mv-catalog-mobile__title">{{ current?.name ?? titleLabel }}</p>
            <button
                type="button"
                class="mv-catalog-mobile__close"
                :aria-label="closeLabel"
                @click="emit('close')"
            >
                <IconX :size="22" aria-hidden="true" />
            </button>
        </div>

        <nav class="mv-catalog-mobile__list">
            <RouterLink
                v-if="current"
                :to="categoryLink(current.slug)"
                class="mv-catalog-mobile__row mv-catalog-mobile__row--all"
                @click="emit('close')"
            >
                {{ allLabel }}
            </RouterLink>
            <template v-for="col in level.items" :key="col.id">
                <button
                    v-if="col.children.length"
                    type="button"
                    class="mv-catalog-mobile__row"
                    data-drill
                    @click="path = [...path, col.id]"
                >
                    <img
                        v-if="col.iconUrl"
                        class="mv-catalog-mobile__icon"
                        :src="col.iconUrl"
                        alt=""
                    />
                    <IconCategory
                        v-else
                        class="mv-catalog-mobile__icon"
                        :size="24"
                        :stroke-width="1.6"
                    />
                    <span class="mv-catalog-mobile__name">{{ col.name }}</span>
                    <IconChevronRight :size="18" aria-hidden="true" />
                </button>
                <RouterLink
                    v-else
                    :to="categoryLink(col.slug)"
                    class="mv-catalog-mobile__row"
                    @click="emit('close')"
                >
                    <img
                        v-if="col.iconUrl"
                        class="mv-catalog-mobile__icon"
                        :src="col.iconUrl"
                        alt=""
                    />
                    <IconCategory
                        v-else
                        class="mv-catalog-mobile__icon"
                        :size="24"
                        :stroke-width="1.6"
                    />
                    <span class="mv-catalog-mobile__name">{{ col.name }}</span>
                    <MvStatusTag v-if="col.isHidden" variant="unavailable">{{
                        hiddenLabel
                    }}</MvStatusTag>
                </RouterLink>
            </template>
        </nav>
    </div>
</template>

<style scoped>
.mv-catalog-mobile {
    padding: 8px 16px calc(var(--mv-bottom-bar-height) + 16px);
}

.mv-catalog-mobile__head {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 44px;
    margin-bottom: 8px;
}

.mv-catalog-mobile__title {
    flex: 1;
    margin: 0;
    min-width: 0;
    font-size: 16px;
    font-weight: 900;
    color: var(--app-nav-text-strong);
}

.mv-catalog-mobile__back,
.mv-catalog-mobile__close {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 44px;
    height: 44px;
    border: 0;
    background: transparent;
    color: var(--app-nav-label);
    font: inherit;
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
    transition:
        background 0.14s,
        color 0.14s;
}

.mv-catalog-mobile__close {
    order: 3;
    border-radius: 50%;
}

.mv-catalog-mobile__back {
    border-radius: var(--app-radius-md);
    padding: 0 8px;
}

.mv-catalog-mobile__back:hover,
.mv-catalog-mobile__close:hover {
    background: var(--app-nav-hover-bg);
    color: var(--app-nav-accent);
}

.mv-catalog-mobile__back:active,
.mv-catalog-mobile__close:active {
    background: var(--app-nav-active-bg);
}

.mv-catalog-mobile__list {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 2px;
}

.mv-catalog-mobile__row {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 48px;
    padding: 0 12px;
    border: 0;
    border-radius: var(--app-radius-md);
    background: transparent;
    color: var(--app-nav-text-body);
    font: inherit;
    font-size: 15px;
    font-weight: 700;
    text-align: left;
    text-decoration: none;
    cursor: pointer;
    transition: background 0.12s;
}

.mv-catalog-mobile__row:hover {
    background: var(--app-nav-hover-bg);
}

.mv-catalog-mobile__row:active {
    background: var(--app-nav-active-bg);
}

.mv-catalog-mobile__row--all {
    color: var(--app-nav-accent);
    font-weight: 900;
}

.mv-catalog-mobile__name {
    flex: 1;
    min-width: 0;
}

.mv-catalog-mobile__icon {
    flex: none;
    width: 28px;
    height: 28px;
    object-fit: contain;
    color: var(--app-nav-text-muted);
}
</style>
