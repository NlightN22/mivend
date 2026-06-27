import { defineStore } from 'pinia';
import { ref } from 'vue';
import { shopApi } from '../api/client';

export interface CollectionItem {
    id: string;
    name: string;
    slug: string;
    children: CollectionItem[];
}

interface RawBreadcrumb {
    id: string;
    name: string;
    slug: string;
}

interface RawCollection {
    id: string;
    name: string;
    slug: string;
    breadcrumbs: RawBreadcrumb[];
    children: { id: string; name: string; slug: string }[];
}

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
            // breadcrumbs length === 2 means top-level (root + self)
            collections.value = result.collections.items
                .filter(c => c.breadcrumbs.length === 2)
                .map(c => ({
                    id: c.id,
                    name: c.name,
                    slug: c.slug,
                    children: c.children ?? [],
                }));
        } finally {
            loading.value = false;
        }
    }

    return { collections, loading, loadCollections };
});
