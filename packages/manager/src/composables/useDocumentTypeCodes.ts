import { ref } from 'vue';
import { fetchSettlementDocumentTypes } from '../api/settlements';

// One global, sorted list per session so a type keeps its colour on every screen.
const codes = ref<string[]>([]);
let loading: Promise<void> | null = null;

// Called on logout so the next user does not inherit the previous user's visibility.
export function resetDocumentTypeCodes(): void {
    codes.value = [];
    loading = null;
}

export function useDocumentTypeCodes(): { codes: typeof codes; ensureLoaded: () => void } {
    function ensureLoaded(): void {
        if (loading) return;
        const pending: Promise<void> = fetchSettlementDocumentTypes()
            .then(result => {
                if (loading !== pending) return;
                codes.value = [...result].sort();
            })
            .catch(e => {
                if (loading === pending) loading = null;
                console.warn('[settlements] could not load global document types:', e);
            });
        loading = pending;
    }
    return { codes, ensureLoaded };
}
