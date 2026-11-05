import { LOGGED_OUT_KEY, useAuthStore } from '../stores/auth';
import { runLogout } from './logoutFlow';

// Hard navigation: a reload resets all stuck state if the logout request hangs during an outage.
export function useLogout(): () => Promise<void> {
    const authStore = useAuthStore();
    return () =>
        runLogout({
            setGuard: () => sessionStorage.setItem(LOGGED_OUT_KEY, '1'),
            logout: () => authStore.logout(),
            navigate: () => {
                window.location.href = '/login';
            },
        });
}
