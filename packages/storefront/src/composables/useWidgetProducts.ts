import { ref, type Ref } from 'vue';
import { shopApi } from '../api/client';
import {
    NewArrivalProductIdsDocument,
    PopularProductIdsDocument,
    SaleProductIdsDocument,
    WidgetProductsDocument,
} from '../api/generated/graphql';
import type { ProductItem } from './useProductList';

type ItemVariant = ProductItem['variants'][number];

interface WidgetVariant extends ItemVariant {
    customFields?: {
        unitName?: string | null;
        unitRatioToBase?: number | null;
        multiplicity?: number | null;
    } | null;
}

export type WidgetMode = 'new-arrivals' | 'sales' | 'popular';

// Overwrite price with customerPrice: variant.price is the raw ERP listPrice, not price-type-aware.
// Widget cards must never show the raw field, so the resolved customer price replaces it here.
export function withResolvedPrice(items: ProductItem[]): ProductItem[] {
    return items.map(item => ({
        ...item,
        variants: (item.variants as WidgetVariant[]).map(variant => ({
            ...variant,
            // undefined, not 0, when unresolved (audit finding, mivend.audit.70) — same fix as
            // useProductList.ts, see its ProductVariant.price comment.
            price: variant.customerPrice ?? undefined,
            unitName: variant.customFields?.unitName ?? null,
            unitRatioToBase: variant.customFields?.unitRatioToBase ?? null,
            multiplicity: variant.customFields?.multiplicity ?? null,
        })),
    }));
}

const WIDGET_SIZE: Record<WidgetMode, number> = {
    'new-arrivals': 12,
    sales: 40,
    popular: 12,
};

// Ids arrive stock-scoped and ranked/ordered from the server with spare entries; the `in` filter drops
// the requested order and any product hidden from the viewer, so reorder and trim client-side.
async function loadByIds(ids: string[], size: number): Promise<ProductItem[]> {
    if (ids.length === 0) return [];
    const result = await shopApi(WidgetProductsDocument, { ids, take: ids.length });
    const byId = new Map(result.products.items.map(item => [item.id, item]));
    const ordered = ids
        .map(id => byId.get(id))
        .filter((item): item is (typeof result.products.items)[number] => !!item);
    return withResolvedPrice(ordered.slice(0, size) as ProductItem[]);
}

async function loadIds(mode: WidgetMode): Promise<string[]> {
    if (mode === 'new-arrivals') {
        return (await shopApi(NewArrivalProductIdsDocument)).newArrivalProductIds;
    }
    if (mode === 'sales') return (await shopApi(SaleProductIdsDocument)).saleProductIds;
    return (await shopApi(PopularProductIdsDocument)).popularProductIds;
}

export function useWidgetProducts(mode: WidgetMode): {
    items: Ref<ProductItem[]>;
    loading: Ref<boolean>;
    load: () => Promise<void>;
} {
    const items = ref<ProductItem[]>([]);
    const loading = ref(false);

    async function load(): Promise<void> {
        loading.value = true;
        try {
            items.value = await loadByIds(await loadIds(mode), WIDGET_SIZE[mode]);
        } catch (e) {
            console.error(`[useWidgetProducts:${mode}]`, e);
            items.value = [];
        } finally {
            loading.value = false;
        }
    }

    return { items, loading, load };
}
