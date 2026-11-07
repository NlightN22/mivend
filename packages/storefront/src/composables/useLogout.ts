import { LOGGED_OUT_KEY, useAuthStore } from '../stores/auth';
import { useActingStore } from '../stores/acting';
import { readManagerUrl } from '../utils/managerUrl';
import { runLogout } from './logoutFlow';

// Hard navigation: a reload resets all stuck state if the logout request hangs during an outage.
// In an acting tab the server logout is refused, so leaving ends the acting session and returns to the manager portal.
export function useLogout(): () => Promise<void> {
    const authStore = useAuthStore();
    const acting = useActingStore();
    return () => {
        const wasActing = acting.isActing;
        return runLogout({
            setGuard: () => sessionStorage.setItem(LOGGED_OUT_KEY, '1'),
            logout: () => (wasActing ? acting.finish() : authStore.logout()),
            navigate: () => {
                if (wasActing) window.close();
                window.location.href = wasActing ? (readManagerUrl() ?? '/login') : '/login';
            },
        });
    };
}
