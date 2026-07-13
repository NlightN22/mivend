import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { adminApi } from '../api/client';

interface AdministratorRole {
    code: string;
    description: string;
}

interface ActiveAdministrator {
    id: string;
    firstName: string;
    lastName: string;
    emailAddress: string;
    customFields: {
        departmentId: string | null;
        branchId: string | null;
    };
    user: {
        roles: AdministratorRole[];
    };
}

const ACTIVE_ADMINISTRATOR_QUERY = `
    query ActiveAdministrator {
        activeAdministrator {
            id
            firstName
            lastName
            emailAddress
            customFields { departmentId branchId }
            user { roles { code description } }
        }
    }
`;

export const useAuthStore = defineStore('auth', () => {
    const administrator = ref<ActiveAdministrator | null>(null);
    const initialized = ref(false);
    let initPromise: Promise<void> | null = null;

    const isLoggedIn = computed(() => administrator.value !== null);

    const fullName = computed(() =>
        administrator.value
            ? `${administrator.value.firstName} ${administrator.value.lastName}`.trim()
            : '',
    );

    // First role is authoritative for the portal role badge — portal roles are configured
    // as one Vendure Role per Administrator (see docs/access-control.md), not combined.
    const roleCode = computed(() => administrator.value?.user.roles[0]?.code ?? null);
    // Role.description (seed-access-roles.mjs) is a full sentence meant for admin config UI
    // ("General director — final approval step, full company-wide visibility"), not a topbar/
    // badge label — derive a short label from the code instead (e.g. "general-director" ->
    // "General Director").
    const roleLabel = computed(() =>
        roleCode.value
            ? roleCode.value
                  .split('-')
                  .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                  .join(' ')
            : null,
    );

    function init(): Promise<void> {
        if (!initPromise) {
            initPromise = fetchActiveAdministrator().finally(() => {
                initialized.value = true;
            });
        }
        return initPromise;
    }

    const LOGGED_OUT_KEY = 'mv_manager_logged_out';

    async function login(username: string, password: string): Promise<boolean> {
        const result = await adminApi<{
            login: { __typename: string; errorCode?: string; id?: string };
        }>(
            `mutation Login($username: String!, $password: String!) {
                login(username: $username, password: $password) {
                    __typename
                    ... on CurrentUser { id }
                    ... on InvalidCredentialsError { errorCode }
                }
            }`,
            { username, password },
        );

        if (result.login.__typename === 'CurrentUser') {
            sessionStorage.removeItem(LOGGED_OUT_KEY);
            initPromise = null;
            await fetchActiveAdministrator();
            return true;
        }
        return false;
    }

    async function logout(): Promise<void> {
        try {
            await adminApi<{ logout: { success: boolean } }>(`mutation { logout { success } }`);
        } catch (e) {
            console.warn('[auth] logout mutation failed:', e);
        }
        administrator.value = null;
        initPromise = null;
        sessionStorage.setItem(LOGGED_OUT_KEY, '1');
    }

    async function fetchActiveAdministrator(): Promise<void> {
        if (sessionStorage.getItem(LOGGED_OUT_KEY)) {
            administrator.value = null;
            return;
        }
        try {
            const result = await adminApi<{ activeAdministrator: ActiveAdministrator | null }>(
                ACTIVE_ADMINISTRATOR_QUERY,
            );
            administrator.value = result.activeAdministrator;
        } catch {
            administrator.value = null;
        }
    }

    return {
        administrator,
        initialized,
        isLoggedIn,
        fullName,
        roleLabel,
        roleCode,
        init,
        login,
        logout,
        fetchActiveAdministrator,
    };
});
