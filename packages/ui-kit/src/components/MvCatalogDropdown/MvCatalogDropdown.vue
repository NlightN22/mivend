<script setup lang="ts">
import { computed, ref } from 'vue';
import { IconCategory } from '@tabler/icons-vue';
import MvStatusTag from '../MvStatusTag/MvStatusTag.vue';
import MvCatalogDropdownGroup, { type CollectionNode } from './MvCatalogDropdownGroup.vue';

export type { CollectionNode };

const props = withDefaults(
    defineProps<{
        collections: CollectionNode[];
        open: boolean;
        loading?: boolean;
        moreLabel?: string;
        lessLabel?: string;
        hiddenLabel?: string;
        loadingLabel?: string;
        emptyLabel?: string;
    }>(),
    { moreLabel: 'More', lessLabel: 'Less', hiddenLabel: 'Hidden', loadingLabel: 'Loading categories…', emptyLabel: 'No categories available' },
);

const emit = defineEmits<{
    close: [];
}>();

const hoveredId = ref<string | null>(null);

const activeCollection = computed(
    () => props.collections.find(c => c.id === hoveredId.value) ?? props.collections[0] ?? null,
);

function categoryLink(slug: string): { path: string; query: { collection: string } } {
    return { path: '/catalog', query: { collection: slug } };
}

</script>

<template>
    <Transition name="catalog-drop">
        <div v-if="open" class="mv-catalog-dropdown" @click.self="emit('close')">
            <div class="mv-catalog-dropdown__inner">
                <aside class="mv-catalog-dropdown__left">
                    <p class="mv-catalog-dropdown__label">Catalogue</p>
                    <nav class="mv-catalog-dropdown__cat-list">
                        <RouterLink
                            v-for="col in collections"
                            :key="col.id"
                            :to="categoryLink(col.slug)"
                            :class="['mv-catalog-dropdown__cat', { 'mv-catalog-dropdown__cat--active': activeCollection?.id === col.id }]"
                            @mouseenter="hoveredId = col.id"
                            @focus="hoveredId = col.id"
                            @click="emit('close')"
                        >
                            <img v-if="col.iconUrl" class="mv-catalog-dropdown__icon" :src="col.iconUrl" alt="" />
                            <IconCategory v-else class="mv-catalog-dropdown__icon" :size="26" :stroke-width="1.6" />
                            <span>{{ col.name }}</span>
                            <MvStatusTag v-if="col.isHidden" variant="unavailable" class="mv-catalog-dropdown__hidden" data-testid="category-hidden-marker">{{ hiddenLabel }}</MvStatusTag>
                        </RouterLink>
                    </nav>
                </aside>

                <div v-if="activeCollection" class="mv-catalog-dropdown__content">
                    <div class="mv-catalog-dropdown__head">
                        <RouterLink
                            class="mv-catalog-dropdown__title"
                            :to="categoryLink(activeCollection.slug)"
                            @click="emit('close')"
                        >
                            {{ activeCollection.name }}
                            <MvStatusTag v-if="activeCollection.isHidden" variant="unavailable" class="mv-catalog-dropdown__hidden" data-testid="category-hidden-marker">{{ hiddenLabel }}</MvStatusTag>
                        </RouterLink>
                    </div>
                    <div v-if="activeCollection.children.length > 0" class="mv-catalog-dropdown__grid">
                        <MvCatalogDropdownGroup
                            v-for="group in activeCollection.children"
                            :key="group.id"
                            :group="group"
                            :more-label="moreLabel"
                            :less-label="lessLabel"
                            :hidden-label="hiddenLabel"
                            @close="emit('close')"
                        />
                    </div>
                </div>

                <div v-else class="mv-catalog-dropdown__content mv-catalog-dropdown__content--empty">
                    {{ loading ? loadingLabel : emptyLabel }}
                </div>
            </div>
        </div>
    </Transition>
</template>

<style scoped>
.mv-catalog-dropdown {
    position: absolute;
    left: 0;
    right: 0;
    top: 100%;
    background: rgba(255, 255, 255, 0.98);
    border-top: 1px solid var(--app-nav-border);
    border-bottom: 1px solid var(--app-nav-border-strong);
    box-shadow: 0 26px 60px rgba(20, 35, 31, 0.16);
    backdrop-filter: blur(18px);
    z-index: 10;
    max-height: calc(100vh - 140px);
    overflow-y: auto;
}

.mv-catalog-dropdown__inner {
    max-width: 1440px;
    margin: 0 auto;
    padding: 18px 28px 26px;
    display: grid;
    grid-template-columns: 280px minmax(0, 1fr);
    gap: 24px;
    min-height: 480px;
}

.mv-catalog-dropdown__left {
    border-right: 1px solid var(--app-nav-border);
    padding-right: 16px;
}

.mv-catalog-dropdown__label {
    margin: 0 0 12px;
    font-size: 11px;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: var(--app-nav-label);
}

.mv-catalog-dropdown__cat-list {
    display: grid;
    gap: 3px;
}

.mv-catalog-dropdown__cat {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 42px;
    padding: 0 14px;
    border-radius: 12px;
    border: none;
    background: transparent;
    text-decoration: none;
    text-align: left;
    font-size: 15px;
    font-weight: 700;
    color: var(--app-nav-text-body);
    cursor: pointer;
    font-family: inherit;
    transition: background 0.12s, color 0.12s;
}

.mv-catalog-dropdown__cat:hover {
    background: var(--app-nav-hover-bg);
}

.mv-catalog-dropdown__cat--active {
    background: var(--app-nav-active-bg);
    color: var(--app-nav-accent);
}

.mv-catalog-dropdown__content {
    padding: 0 4px;
}

.mv-catalog-dropdown__content--empty {
    display: flex;
    align-items: center;
    color: var(--app-nav-text-faint);
    font-size: 15px;
}

.mv-catalog-dropdown__head {
    margin-bottom: 20px;
}

.mv-catalog-dropdown__title:hover {
    color: var(--app-nav-accent);
}

.mv-catalog-dropdown__title {
    display: inline-block;
    text-decoration: none;
    font-size: 28px;
    font-weight: 900;
    letter-spacing: -0.04em;
    color: var(--app-nav-text-strong);
}

.mv-catalog-dropdown__grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(180px, 1fr));
    gap: 22px 32px;
    align-items: start;
}

.mv-catalog-dropdown__hidden {
    margin-left: 8px;
    padding: 0 6px;
    font-size: 11px;
    line-height: 16px;
    vertical-align: middle;
}

.mv-catalog-dropdown__icon {
    flex: none;
    width: 28px;
    height: 28px;
    object-fit: contain;
    color: var(--app-nav-text-muted);
}

.catalog-drop-enter-active,
.catalog-drop-leave-active {
    transition: opacity 0.15s ease, transform 0.15s ease;
}

.catalog-drop-enter-from,
.catalog-drop-leave-to {
    opacity: 0;
    transform: translateY(-8px);
}

@media (max-width: 1180px) {
    .mv-catalog-dropdown {
        display: none;
    }
}

@media (max-width: 960px) {
    .mv-catalog-dropdown__inner {
        grid-template-columns: 1fr;
        min-height: 0;
    }

    .mv-catalog-dropdown__left {
        border-right: none;
        padding-right: 0;
    }

    .mv-catalog-dropdown__grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }
}
</style>
