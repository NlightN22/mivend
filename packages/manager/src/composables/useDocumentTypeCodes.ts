import { ref } from 'vue';
import { fetchSettlementTypeCounts } from '../api/settlements';

// One global, sorted list per session so a type keeps its colour on every screen.
const codes = ref<string[]>([]);
let loading: Promise<void> | null = null;

export function useDocumentTypeCodes(): { codes: typeof codes; ensureLoaded: () => void } {
    function ensureLoaded(): void {
        if (loading) return;
        loading = fetchSettlementTypeCounts('')
            .then(result => {
                codes.value = result.map(c => c.documentType).sort();
            })
            .catch(e => {
                loading = null;
                console.warn('[settlements] could not load global document types:', e);
            });
    }
    return { codes, ensureLoaded };
}
