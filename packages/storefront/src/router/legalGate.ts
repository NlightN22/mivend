import type { RouteLocationRaw } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { useLegalStore } from '../stores/legal';

const EXEMPT = ['/login', '/legal-consent', '/legal/'];

// Sends a signed-in customer to the confirmation screen while a required document is unanswered.
// A failed status read lets navigation proceed, so an outage never locks anyone out.
export async function legalRedirect(
    path: string,
    fullPath: string,
): Promise<RouteLocationRaw | null> {
    const auth = useAuthStore();
    if (auth.authStatus !== 'authenticated' || !auth.customer) return null;
    if (EXEMPT.some(prefix => path === prefix || path.startsWith(prefix))) return null;
    const legal = useLegalStore();
    if (legal.loadedFor !== auth.customer.id) {
        try {
            await legal.load(auth.customer.id);
        } catch {
            return null;
        }
    }
    return legal.blocking ? { path: '/legal-consent', query: { redirect: fullPath } } : null;
}
