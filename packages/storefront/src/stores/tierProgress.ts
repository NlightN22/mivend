import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import { shopApi } from '../api/client';
import { VariantTierProgressDocument } from '../api/generated/graphql';
import { useAuthStore } from './auth';
import { useCartStore, type TierProgress } from './cart';

const BATCH = 100;

export const useTierProgressStore = defineStore('tierProgress', () => {
    const byVariant = ref<Record<string, TierProgress | null>>({});
    const tracked = new Set<string>();
    const cart = useCartStore();
    const auth = useAuthStore();

    async function load(ids: string[]): Promise<void> {
        for (let i = 0; i < ids.length; i += BATCH) {
            const chunk = ids.slice(i, i + BATCH);
            try {
                const result = await shopApi(VariantTierProgressDocument, { ids: chunk });
                const next = { ...byVariant.value };
                for (const product of result.products.items) {
                    for (const v of product.variants) next[v.id] = v.tierProgress ?? null;
                }
                byVariant.value = next;
            } catch {
                // Progress is a hint; a failed refresh keeps the last known value.
            }
        }
    }

    let queued: string[] = [];

    // Cards mount in bulk; one request per tick covers all of them.
    function track(productId: string): void {
        if (!auth.isLoggedIn || tracked.has(productId)) return;
        tracked.add(productId);
        if (queued.length === 0) {
            setTimeout(() => {
                const ids = queued;
                queued = [];
                void load(ids);
            }, 0);
        }
        queued.push(productId);
    }

    watch(
        () => cart.serverVersion,
        () => {
            if (tracked.size > 0 && auth.isLoggedIn) void load([...tracked]);
        },
    );

    return { byVariant, track };
});
