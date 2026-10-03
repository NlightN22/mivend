<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { IconCategory } from '@tabler/icons-vue';

export interface CollectionNode {
    id: string;
    name: string;
    slug: string;
    iconUrl?: string | null;
    children: CollectionNode[];
}

const GROUP_PREVIEW_LIMIT = 6;

const props = defineProps<{
    collections: CollectionNode[];
    open: boolean;
    loading?: boolean;
}>();

const emit = defineEmits<{
    close: [];
}>();

const hoveredId = ref<string | null>(null);
const expandedGroups = reactive(new Set<string>());

const activeCollection = computed(
    () => props.collections.find(c => c.id === hoveredId.value) ?? props.collections[0] ?? null,
);

function categoryLink(slug: string): { path: string; query: { collection: string } } {
    return { path: '/catalog', query: { collection: slug } };
}

function visibleItems(group: CollectionNode): CollectionNode[] {
    return expandedGroups.has(group.id) ? group.children : group.children.slice(0, GROUP_PREVIEW_LIMIT);
}

function toggleGroup(id: string): void {
    if (expandedGroups.has(id)) expandedGroups.delete(id);
    else expandedGroups.add(id);
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
                        </RouterLink>
                    </div>
                    <div v-if="activeCollection.children.length > 0" class="mv-catalog-dropdown__grid">
                        <div v-for="group in activeCollection.children" :key="group.id" class="mv-catalog-dropdown__group">
                            <RouterLink
                                class="mv-catalog-dropdown__group-title"
                                :to="categoryLink(group.slug)"
                                @click="emit('close')"
                            >
                                {{ group.name }}
                            </RouterLink>
                            <RouterLink
                                v-for="item in visibleItems(group)"
                                :key="item.id"
                                class="mv-catalog-dropdown__sub"
                                :to="categoryLink(item.slug)"
                                @click="emit('close')"
                            >
                                {{ item.name }}
                            </RouterLink>
                            <button
                                v-if="group.children.length > GROUP_PREVIEW_LIMIT"
                                type="button"
                                class="mv-catalog-dropdown__more"
                                @click="toggleGroup(group.id)"
                            >
                                {{ expandedGroups.has(group.id) ? 'Less' : 'More' }}
                            </button>
                        </div>
                    </div>
                </div>

                <div v-else class="mv-catalog-dropdown__content mv-catalog-dropdown__content--empty">
                    {{ loading ? 'Loading categories…' : 'No categories available' }}
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
    border-top: 1px solid #edf2ef;
    border-bottom: 1px solid #dde7e2;
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
    border-right: 1px solid #edf2ef;
    padding-right: 16px;
}

.mv-catalog-dropdown__label {
    margin: 0 0 12px;
    font-size: 11px;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: #66736e;
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
    color: #26342f;
    cursor: pointer;
    font-family: inherit;
    transition: background 0.12s, color 0.12s;
}

.mv-catalog-dropdown__cat:hover {
    background: #f3f7f5;
}

.mv-catalog-dropdown__cat--active {
    background: #e2f8ef;
    color: #008a64;
    font-weight: 900;
}

.mv-catalog-dropdown__content {
    padding: 0 4px;
}

.mv-catalog-dropdown__content--empty {
    display: flex;
    align-items: center;
    color: #a8b8b2;
    font-size: 15px;
}

.mv-catalog-dropdown__head {
    margin-bottom: 20px;
}

.mv-catalog-dropdown__title:hover {
    color: #008a64;
}

.mv-catalog-dropdown__title {
    display: inline-block;
    text-decoration: none;
    font-size: 28px;
    font-weight: 900;
    letter-spacing: -0.04em;
    color: #14231f;
}

.mv-catalog-dropdown__grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(180px, 1fr));
    gap: 22px 32px;
    align-items: start;
}

.mv-catalog-dropdown__group {
    display: grid;
    gap: 2px;
}

.mv-catalog-dropdown__group-title {
    display: block;
    padding: 6px 10px;
    border-radius: 8px;
    font-size: 15px;
    font-weight: 850;
    color: #14231f;
    text-decoration: none;
}

.mv-catalog-dropdown__group-title:hover {
    color: #008a64;
    background: #f3f7f5;
}

.mv-catalog-dropdown__more {
    justify-self: start;
    min-height: 32px;
    padding: 0 10px;
    border: none;
    background: transparent;
    font-size: 13px;
    font-weight: 700;
    color: #00a878;
    cursor: pointer;
    font-family: inherit;
}

.mv-catalog-dropdown__icon {
    flex: none;
    width: 28px;
    height: 28px;
    object-fit: contain;
    color: #62736c;
}

.mv-catalog-dropdown__sub {
    display: flex;
    align-items: center;
    min-height: 32px;
    padding: 0 10px;
    border: none;
    background: transparent;
    text-decoration: none;
    text-align: left;
    font-size: 14px;
    color: #62736c;
    cursor: pointer;
    font-family: inherit;
    border-radius: 8px;
    transition: color 0.12s, background 0.12s;
}

.mv-catalog-dropdown__sub:hover {
    color: #008a64;
    background: #f3f7f5;
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
