import { defineStore } from 'pinia';
import { ref } from 'vue';
import { shopApi } from '../api/client';
import { CatalogCollectionsDocument } from '../api/generated/graphql';
// Imports the TS source directly — see the comment in useProductList.ts for why 'shared''s
// compiled package output breaks a Vite production build.
import {
    buildCategoryTree,
    type CollectionNode,
    type RawCollection,
} from '../../../shared/src/collectionTree';

export type CollectionItem = CollectionNode;

export const useCatalogStore = defineStore('catalog', () => {
    const collections = ref<CollectionItem[]>([]);
    // The flat list backing `collections` — kept so any consumer can build other shapes
    // (e.g. the catalog sidebar's ancestors/children panel) without a second network call.
    const rawCollections = ref<RawCollection[]>([]);
    const loading = ref(false);

    async function loadCollections(): Promise<void> {
        if (rawCollections.value.length > 0) return;
        loading.value = true;
        try {
            const result = await shopApi(CatalogCollectionsDocument);
            rawCollections.value = result.collections.items as RawCollection[];
            collections.value = buildCategoryTree(rawCollections.value);
        } finally {
            loading.value = false;
        }
    }

    return { collections, rawCollections, loading, loadCollections };
});
