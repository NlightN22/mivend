import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { adminApi, ApiNetworkError } from '../api/client';

interface AdministratorRole {
    code: string;
    description: string;
    permissions: string[];
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
            user { roles { code description permissions } }
        }
    }
`;

type AuthStatus = 'unknown' | 'authenticated' | 'unauthenticated';

// Background retry tuning for a network outage that outlasts adminApi's own bounded ~4.2s
// retry (see api/client.ts) — capped exponential backoff, retried indefinitely rather than
// ever concluding "logged out" from a network failure alone. See AGENTS.md's "A fetch()
// network failure is not the same as 'logged out'" gotcha.
const BACKGROUND_RETRY_INITIAL_MS = 2_000;
const BACKGROUND_RETRY_MAX_MS = 20_000;

export const useAuthStore = defineStore('auth', () => {
    const administrator = ref<ActiveAdministrator | null>(null);
    const initialized = ref(false);
    // Tri-state, distinct from `administrator`/`isLoggedIn`: 'unknown' covers both "not yet
    // checked" and "currently retrying after a network failure" — the router guard only
    // redirects to /login on a *confirmed* 'unauthenticated', never on 'unknown', so a prolonged
    // outage never force-logs-out a still-valid session.
    const authStatus = ref<AuthStatus>('unknown');
    const isReconnecting = ref(false);
    let initPromise: Promise<void> | null = null;
    // Bumped on every fetchActiveAdministrator()/login()/logout() call so a stale background
    // retry loop from an earlier call can detect it's been superseded and stop touching state.
    let generation = 0;
    let backgroundRetryTimer: ReturnType<typeof setTimeout> | null = null;

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

    // Union across roles defensively, even though roleCode's comment above notes the current
    // convention is one Vendure Role per Administrator. This is the ground truth for "can this
    // user do X" UI gates — check permissions directly (mirrors the backend's own @Allow(...)
    // checks), never a role-code allowlist duplicated per component, which drifts from what the
    // native Vendure admin UI actually grants a role.
    const permissions = computed(
        () => administrator.value?.user.roles.flatMap(r => r.permissions) ?? [],
    );

    function hasPermission(name: string): boolean {
        return permissions.value.includes(name);
    }

    function init(): Promise<void> {
        if (!initPromise) {
            initPromise = fetchActiveAdministrator().finally(() => {
                initialized.value = true;
            });
        }
        return initPromise;
    }

    const LOGGED_OUT_KEY = 'mv_manager_logged_out';

    async function login(username: string, password: string, rememberMe = false): Promise<boolean> {
        const result = await adminApi<{
            login: { __typename: string; errorCode?: string; id?: string };
        }>(
            `mutation Login($username: String!, $password: String!, $rememberMe: Boolean) {
                login(username: $username, password: $password, rememberMe: $rememberMe) {
                    __typename
                    ... on CurrentUser { id }
                    ... on InvalidCredentialsError { errorCode }
                }
            }`,
            { username, password, rememberMe },
        );

        if (result.login.__typename === 'CurrentUser') {
            sessionStorage.removeItem(LOGGED_OUT_KEY);
            initPromise = null;
            generation++;
            stopBackgroundRetry();
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
        generation++;
        stopBackgroundRetry();
        administrator.value = null;
        authStatus.value = 'unauthenticated';
        isReconnecting.value = false;
        initPromise = null;
        sessionStorage.setItem(LOGGED_OUT_KEY, '1');
    }

    function stopBackgroundRetry(): void {
        if (backgroundRetryTimer !== null) {
            clearTimeout(backgroundRetryTimer);
            backgroundRetryTimer = null;
        }
        isReconnecting.value = false;
    }

    function applyResult(
        myGeneration: number,
        result: { activeAdministrator: ActiveAdministrator | null },
    ): void {
        if (myGeneration !== generation) return; // superseded by a later call
        administrator.value = result.activeAdministrator;
        authStatus.value = result.activeAdministrator ? 'authenticated' : 'unauthenticated';
        isReconnecting.value = false;
    }

    // Keeps retrying indefinitely (capped backoff) after adminApi's own bounded ~4.2s retry is
    // exhausted — a prolonged outage must never be mistaken for "logged out". Only a real HTTP
    // response (success or a confirmed-null activeAdministrator) ends the loop; a superseded
    // generation (login/logout/a fresh fetchActiveAdministrator call) also stops it silently.
    function scheduleBackgroundRetry(myGeneration: number, delayMs: number): void {
        backgroundRetryTimer = setTimeout(() => {
            if (myGeneration !== generation) return;
            adminApi<{ activeAdministrator: ActiveAdministrator | null }>(
                ACTIVE_ADMINISTRATOR_QUERY,
            )
                .then(result => {
                    if (myGeneration !== generation) return;
                    applyResult(myGeneration, result);
                })
                .catch((e: unknown) => {
                    if (myGeneration !== generation) return;
                    if (e instanceof ApiNetworkError) {
                        scheduleBackgroundRetry(
                            myGeneration,
                            Math.min(delayMs * 2, BACKGROUND_RETRY_MAX_MS),
                        );
                    } else {
                        administrator.value = null;
                        authStatus.value = 'unauthenticated';
                        isReconnecting.value = false;
                    }
                });
        }, delayMs);
    }

    async function fetchActiveAdministrator(): Promise<void> {
        generation++;
        const myGeneration = generation;
        stopBackgroundRetry();

        if (sessionStorage.getItem(LOGGED_OUT_KEY)) {
            administrator.value = null;
            authStatus.value = 'unauthenticated';
            return;
        }
        try {
            const result = await adminApi<{ activeAdministrator: ActiveAdministrator | null }>(
                ACTIVE_ADMINISTRATOR_QUERY,
            );
            applyResult(myGeneration, result);
        } catch (e) {
            // A network failure (adminApi already retried a couple of times — see
            // ApiNetworkError's doc comment) means we simply don't know the session's real
            // state, not that the user is logged out. Vendure sessions last a year by default,
            // so the cookie is almost certainly still valid — clearing `administrator` here
            // would force a real, logged-in user back to the login screen just because the
            // server was briefly unreachable (e.g. a dev restart). Only a real response —
            // `activeAdministrator: null` — means "confirmed not logged in". A network failure
            // instead keeps status 'unknown' and hands off to an indefinite background retry
            // rather than blocking this call (and whatever awaits it, e.g. the router guard).
            if (!(e instanceof ApiNetworkError)) {
                administrator.value = null;
                authStatus.value = 'unauthenticated';
                return;
            }
            isReconnecting.value = true;
            scheduleBackgroundRetry(myGeneration, BACKGROUND_RETRY_INITIAL_MS);
        }
    }

    return {
        administrator,
        initialized,
        isLoggedIn,
        authStatus,
        isReconnecting,
        fullName,
        roleLabel,
        roleCode,
        permissions,
        hasPermission,
        init,
        login,
        logout,
        fetchActiveAdministrator,
    };
});
