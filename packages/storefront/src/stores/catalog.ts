import { defineStore } from 'pinia';
import { ref } from 'vue';
import { shopApi } from '../api/client';
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
    const loading = ref(false);

    async function loadCollections(): Promise<void> {
        if (collections.value.length > 0) return;
        loading.value = true;
        try {
            const result = await shopApi<{ collections: { items: RawCollection[] } }>(`
                query CatalogCollections {
                    collections(options: { take: 100 }) {
                        items {
                            id name slug
                            breadcrumbs { id name slug }
                            children { id name slug }
                        }
                    }
                }
            `);
            collections.value = buildCategoryTree(result.collections.items);
        } finally {
            loading.value = false;
        }
    }

    return { collections, loading, loadCollections };
});
