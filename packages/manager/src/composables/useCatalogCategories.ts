import { computed, ref, type ComputedRef, type Ref } from 'vue';
import { useRouter, type LocationQuery } from 'vue-router';
import { fetchCategoryTree } from '../api/catalog';
import {
    buildCategoryPanel,
    findCategoryPath,
    type CategoryPanelData,
    type CollectionNode,
} from '../../../shared/src/collectionTree';

export interface CrumbItem {
    label: string;
    to?: string;
}

export function useCatalogCategories(
    collection: Ref<string | undefined>,
    query: Ref<LocationQuery>,
): {
    tree: Ref<CollectionNode[]>;
    panel: ComputedRef<CategoryPanelData>;
    breadcrumbs: ComputedRef<CrumbItem[]>;
    heading: ComputedRef<string>;
    loadTree: () => Promise<void>;
    navigate: (slug: string | undefined) => void;
} {
    const router = useRouter();
    const tree = ref<CollectionNode[]>([]);
    const panel = computed(() => buildCategoryPanel(tree.value, collection.value));
    const path = computed(() =>
        collection.value ? findCategoryPath(tree.value, collection.value) : [],
    );

    const breadcrumbs = computed<CrumbItem[]>(() => {
        const p = path.value;
        if (p.length === 0) return [{ label: 'Catalog' }];
        return [
            { label: 'Catalog', to: '/catalog' },
            ...p.slice(0, -1).map(n => ({ label: n.name, to: `/catalog?collection=${n.slug}` })),
            { label: p[p.length - 1].name },
        ];
    });

    const heading = computed(() => panel.value.current?.name ?? 'Catalog');

    async function loadTree(): Promise<void> {
        if (tree.value.length === 0) tree.value = await fetchCategoryTree();
    }

    function navigate(slug: string | undefined): void {
        void router.push({
            query: { ...query.value, collection: slug, fv: undefined, page: undefined },
        });
    }

    return { tree, panel, breadcrumbs, heading, loadTree, navigate };
}
