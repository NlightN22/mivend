import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { clearPersonalUiState } from '../composables/clearPersonalUiState';
import { adminApi } from '../api/client';
import {
    ActiveAdministratorDocument,
    LoginDocument,
    LogoutDocument,
    type ActiveAdministratorFieldsFragment,
} from '../api/generated/graphql';

// Schema says customFields is nullable, but Vendure always populates it; normalize once here.
//
type ActiveAdministrator = Omit<ActiveAdministratorFieldsFragment, 'customFields'> & {
    customFields: NonNullable<ActiveAdministratorFieldsFragment['customFields']>;
};

function normalizeActiveAdministrator(
    admin: ActiveAdministratorFieldsFragment,
): ActiveAdministrator {
    return {
        ...admin,
        customFields: admin.customFields ?? { departmentId: null, branchId: null },
    };
}

// Built-in account name, identical in every contour: used only to warn, never to gate permissions.
// Permission checks stay in hasPermission below.
const DEFAULT_SUPERADMIN_IDENTIFIER = 'superadmin';

type AuthStatus = 'unknown' | 'authenticated' | 'unauthenticated';

// Outlasts adminApi's bounded retry: capped backoff, retry indefinitely.
// A network failure alone must never be treated as logged out.
const BACKGROUND_RETRY_INITIAL_MS = 2_000;
const BACKGROUND_RETRY_MAX_MS = 20_000;
// Lets a session dying server-side surface while the user sits on a page, not only on their
// next navigation (the router guard's own moment for a confirmed logout).
const HEARTBEAT_INTERVAL_MS = 60_000;

export const useAuthStore = defineStore('auth', () => {
    const administrator = ref<ActiveAdministrator | null>(null);
    const initialized = ref(false);
    // 'unknown' covers both not-yet-checked and retrying after a network failure.
    // Router redirects to /login only on confirmed 'unauthenticated', never on 'unknown'.
    const authStatus = ref<AuthStatus>('unknown');
    const isReconnecting = ref(false);
    // Set the moment isReconnecting flips true, cleared when it flips false — lets the UI (the
    // connection bar) escalate its own message the longer an outage runs, without polling.
    const reconnectingSince = ref<number | null>(null);
    let initPromise: Promise<void> | null = null;
    // Bumped on every fetchActiveAdministrator()/login()/logout() call so a stale background
    // retry loop from an earlier call can detect it's been superseded and stop touching state.
    let generation = 0;
    let backgroundRetryTimer: ReturnType<typeof setTimeout> | null = null;
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

    const isLoggedIn = computed(() => administrator.value !== null);

    const fullName = computed(() =>
        administrator.value
            ? `${administrator.value.firstName} ${administrator.value.lastName}`.trim()
            : '',
    );

    // First role is authoritative for the portal role badge — portal roles are configured
    // as one Vendure Role per Administrator (see docs/access-control.md), not combined.
    const roleCode = computed(() => administrator.value?.user.roles[0]?.code ?? null);
    // Role.description is a full sentence for admin config UI, not a badge label.
    // Derive the short label from the role code instead.
    const roleLabel = computed(() =>
        roleCode.value
            ? roleCode.value
                  .split('-')
                  .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                  .join(' ')
            : null,
    );

    // Union across roles defensively, though each Administrator normally has one role.
    // Check permissions directly, not role-code allowlists, which drift from Vendure's own grants.
    const permissions = computed(
        () => administrator.value?.user.roles.flatMap(r => r.permissions) ?? [],
    );

    function hasPermission(name: string): boolean {
        // Permission is a GraphQL enum, but this app's checks use plain strings throughout.
        // Narrowing the type here would not be meaningful.
        return (permissions.value as string[]).includes(name);
    }

    // Built-in superadmin credentials ship identical in every contour and nothing forces a change.
    // Warning only, never blocking; see the panel's doc comment for why no forced gate.
    const isDefaultSuperadminAccount = computed(
        () => administrator.value?.user.identifier === DEFAULT_SUPERADMIN_IDENTIFIER,
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

    async function login(username: string, password: string, rememberMe = false): Promise<boolean> {
        const result = await adminApi(LoginDocument, { username, password, rememberMe });

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
            await adminApi(LogoutDocument);
        } catch (e) {
            console.warn('[auth] logout mutation failed:', e);
        }
        // Clear this admin's persisted table UI state so a shared machine never shows stale prefs.
        // Must run before administrator.value is cleared, since it needs the id.
        if (administrator.value) clearPersonalUiState(administrator.value.id);
        generation++;
        stopBackgroundRetry();
        stopHeartbeat();
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
        reconnectingSince.value = null;
    }

    // Re-checks activeAdministrator on a timer while authenticated, so a session dying
    // server-side is noticed while the user sits on a page, not only on their next navigation.
    function startHeartbeat(): void {
        if (heartbeatTimer !== null) return;
        heartbeatTimer = setInterval(() => {
            void fetchActiveAdministrator();
        }, HEARTBEAT_INTERVAL_MS);
    }

    function stopHeartbeat(): void {
        if (heartbeatTimer !== null) {
            clearInterval(heartbeatTimer);
            heartbeatTimer = null;
        }
    }

    function applyResult(
        myGeneration: number,
        result: { activeAdministrator: ActiveAdministratorFieldsFragment | null },
    ): void {
        if (myGeneration !== generation) return; // superseded by a later call
        administrator.value = result.activeAdministrator
            ? normalizeActiveAdministrator(result.activeAdministrator)
            : null;
        authStatus.value = result.activeAdministrator ? 'authenticated' : 'unauthenticated';
        isReconnecting.value = false;
        if (result.activeAdministrator) {
            startHeartbeat();
        } else {
            stopHeartbeat();
        }
    }

    // Retry indefinitely past adminApi's bounded retry: an outage must never look like logout.
    // Only a real HTTP response ends the loop; a superseded generation stops it silently.
    function scheduleBackgroundRetry(myGeneration: number, delayMs: number): void {
        backgroundRetryTimer = setTimeout(() => {
            if (myGeneration !== generation) return;
            adminApi(ActiveAdministratorDocument)
                .then(result => {
                    if (myGeneration !== generation) return;
                    applyResult(myGeneration, result);
                })
                .catch(() => {
                    if (myGeneration !== generation) return;
                    // activeAdministrator returns a clean null for logged-out, so any thrown error is ambiguous.
                    // Keep retrying rather than assuming the caller is unauthenticated.
                    scheduleBackgroundRetry(
                        myGeneration,
                        Math.min(delayMs * 2, BACKGROUND_RETRY_MAX_MS),
                    );
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
            const result = await adminApi(ActiveAdministratorDocument);
            applyResult(myGeneration, result);
        } catch {
            // A thrown error means unknown session state, not logout: Vendure sessions last a year.
            // Clearing administrator here would wrongly force a logged-in user to the login screen.
            isReconnecting.value = true;
            reconnectingSince.value = Date.now();
            scheduleBackgroundRetry(myGeneration, BACKGROUND_RETRY_INITIAL_MS);
        }
    }

    return {
        administrator,
        initialized,
        isLoggedIn,
        authStatus,
        isReconnecting,
        reconnectingSince,
        fullName,
        roleLabel,
        roleCode,
        permissions,
        hasPermission,
        isDefaultSuperadminAccount,
        init,
        login,
        logout,
        fetchActiveAdministrator,
    };
});
