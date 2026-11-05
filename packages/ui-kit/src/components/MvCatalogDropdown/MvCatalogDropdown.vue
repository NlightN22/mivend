<script setup lang="ts">
import { computed, ref } from 'vue';
import { IconCategory } from '@tabler/icons-vue';
import MvStatusTag from '../MvStatusTag/MvStatusTag.vue';
import MvCatalogMobileNav from './MvCatalogMobileNav.vue';
import { COMPACT_NAV_BREAKPOINT } from '../../styles/breakpoints';
import { useIsMobileViewport } from '../../composables/useIsMobileViewport';
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
        titleLabel?: string;
        backLabel?: string;
        allLabel?: string;
        closeLabel?: string;
    }>(),
    {
        moreLabel: 'More',
        lessLabel: 'Less',
        hiddenLabel: 'Hidden',
        loadingLabel: 'Loading categories…',
        emptyLabel: 'No categories available',
        titleLabel: 'Catalogue',
        backLabel: 'Back',
        allLabel: 'All in category',
        closeLabel: 'Close',
    },
);

const emit = defineEmits<{
    close: [];
}>();

const isMobile = useIsMobileViewport(COMPACT_NAV_BREAKPOINT);
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
            <MvCatalogMobileNav
                v-if="isMobile"
                :collections="collections"
                :open="open"
                :title-label="titleLabel"
                :back-label="backLabel"
                :all-label="allLabel"
                :close-label="closeLabel"
                :hidden-label="hiddenLabel"
                @close="emit('close')"
            />
            <div v-else class="mv-catalog-dropdown__inner">
                <aside class="mv-catalog-dropdown__left">
                    <p class="mv-catalog-dropdown__label">{{ titleLabel }}</p>
                    <nav class="mv-catalog-dropdown__cat-list">
                        <RouterLink
                            v-for="col in collections"
                            :key="col.id"
                            :to="categoryLink(col.slug)"
                            :class="[
                                'mv-catalog-dropdown__cat',
                                {
                                    'mv-catalog-dropdown__cat--active':
                                        activeCollection?.id === col.id,
                                },
                            ]"
                            @mouseenter="hoveredId = col.id"
                            @focus="hoveredId = col.id"
                            @click="emit('close')"
                        >
                            <img
                                v-if="col.iconUrl"
                                class="mv-catalog-dropdown__icon"
                                :src="col.iconUrl"
                                alt=""
                            />
                            <IconCategory
                                v-else
                                class="mv-catalog-dropdown__icon"
                                :size="26"
                                :stroke-width="1.6"
                            />
                            <span>{{ col.name }}</span>
                            <MvStatusTag
                                v-if="col.isHidden"
                                variant="unavailable"
                                class="mv-catalog-dropdown__hidden"
                                data-testid="category-hidden-marker"
                                >{{ hiddenLabel }}</MvStatusTag
                            >
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
                            <MvStatusTag
                                v-if="activeCollection.isHidden"
                                variant="unavailable"
                                class="mv-catalog-dropdown__hidden"
                                data-testid="category-hidden-marker"
                                >{{ hiddenLabel }}</MvStatusTag
                            >
                        </RouterLink>
                    </div>
                    <div
                        v-if="activeCollection.children.length > 0"
                        class="mv-catalog-dropdown__grid"
                    >
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

                <div
                    v-else
                    class="mv-catalog-dropdown__content mv-catalog-dropdown__content--empty"
                >
                    {{ loading ? loadingLabel : emptyLabel }}
                </div>
            </div>
        </div>
    </Transition>
</template>

<style scoped src="./MvCatalogDropdown.css"></style>
