import { defineStore } from 'pinia';
import { ref } from 'vue';
import { shopApi } from '../api/client';
import { CatalogCollectionsDocument } from '../api/generated/graphql';
// Imports the TS source directly — see the comment in useProductList.ts for why 'shared''s
// compiled package output breaks a Vite production build.
import {
    buildCategoryTree,
    fetchAllCollections,
    type CollectionNode,
    type RawCollection,
} from '../../../shared/src/collectionTree';

export type CollectionItem = CollectionNode;

export const useCatalogStore = defineStore('catalog', () => {
    const collections = ref<CollectionItem[]>([]);
    const loading = ref(false);

    async function loadCollections(): Promise<void> {
        if (collections.value.length > 0 || loading.value) return;
        loading.value = true;
        try {
            const items = await fetchAllCollections<RawCollection>(async (skip, take) => {
                const result = await shopApi(CatalogCollectionsDocument, { skip, take });
                return result.collections;
            });
            collections.value = buildCategoryTree(items);
        } finally {
            loading.value = false;
        }
    }

    return { collections, loading, loadCollections };
});
