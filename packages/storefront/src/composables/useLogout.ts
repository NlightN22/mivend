import { useAuthStore } from '../stores/auth';

// Hard navigation: logout() may itself hang during an outage, a reload resets all stuck state.
export function useLogout(): () => void {
    const authStore = useAuthStore();
    return () => {
        void authStore.logout();
        window.location.href = '/login';
    };
}
