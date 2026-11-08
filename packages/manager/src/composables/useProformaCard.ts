import { ref, watch } from 'vue';
import { fetchProformaCard, type ProformaCard } from '../api/proformaInvoiceCard';

export function useProformaCard(id: () => string) {
    const card = ref<ProformaCard | null>(null);
    const loading = ref(true);
    const notFound = ref(false);
    let seq = 0;

    async function load(): Promise<void> {
        const mine = (seq += 1);
        loading.value = true;
        try {
            const result = await fetchProformaCard(id());
            if (mine !== seq) return;
            card.value = result;
            notFound.value = result === null;
        } catch {
            if (mine !== seq) return;
            card.value = null;
            notFound.value = true;
        } finally {
            if (mine === seq) loading.value = false;
        }
    }

    watch(id, load, { immediate: true });

    return { card, loading, notFound };
}
