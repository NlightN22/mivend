import { computed, ref } from 'vue';
import { startActingSession } from '../api/actingSession';
import { useAuthStore } from '../stores/auth';

export function useActAsCustomer(counterpartyId: () => string) {
    const auth = useAuthStore();
    const allowed = computed(() => auth.hasPermission('CreateOrder'));
    const starting = ref(false);
    const error = ref('');

    async function start(): Promise<void> {
        // Opened before the request so the browser treats it as a click-initiated tab.
        const tab = window.open('about:blank', '_blank');
        if (tab) tab.opener = null;
        starting.value = true;
        error.value = '';
        try {
            const url = await startActingSession(counterpartyId());
            if (tab) tab.location.href = url;
            else window.open(url, '_blank');
        } catch (e) {
            tab?.close();
            error.value = e instanceof Error ? e.message : 'Could not start acting as the customer';
        } finally {
            starting.value = false;
        }
    }

    return { allowed, starting, error, start };
}
