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

// Administrator.customFields is nullable at the wrapper-object level per the GraphQL schema, but
// Vendure always populates it in practice — normalized once here, same pattern as
// api/customers.ts's normalizeOrderItem.
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

// The identifier every contour ships with (SUPERADMIN_USERNAME, same literal value in every
// apps/server/.env.* — see docs/environments.md) — used only to warn that this session is still
// on the built-in account, never to gate any actual permission (that stays permission-based, see
// hasPermission below).
const DEFAULT_SUPERADMIN_IDENTIFIER = 'superadmin';

type AuthStatus = 'unknown' | 'authenticated' | 'unauthenticated';

// Background retry tuning for a network outage that outlasts adminApi's own bounded ~4.2s
// retry (see api/client.ts) — capped exponential backoff, retried indefinitely rather than
// ever concluding "logged out" from a network failure alone. See the backend-plugin-rules skill's "A fetch()
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
    // Set the moment isReconnecting flips true, cleared when it flips false — lets the UI (the
    // connection bar) escalate its own message the longer an outage runs, without polling.
    const reconnectingSince = ref<number | null>(null);
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
        // Permission is a real GraphQL enum (Vendure's fixed native+custom permission set), but
        // this app's own permission checks (this function's callers, PERMISSION_CATEGORIES in
        // api/settings.ts) work with plain strings throughout — narrowing isn't meaningful here.
        return (permissions.value as string[]).includes(name);
    }

    // Real incident (2026-09-12): a fresh contour's only administrator is the built-in
    // superadmin/superadmin account (SUPERADMIN_USERNAME/PASSWORD env vars, identical literal
    // value across every apps/server/.env.* file) — nothing in this codebase ever prompts anyone
    // to change it. Surfaced as a dashboard warning (DefaultLayout.vue) linking to
    // /settings/security's new "Change password" panel, never blocking — see that panel's own
    // doc comment for why a stricter, forced-change gate isn't implemented here.
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
        // Clears this administrator's own persisted table/column UI state (order/width/
        // visibility/sort/pageSize/filters) — never lets a stale preference from an earlier
        // session silently resurface next time they (or someone else, on a shared machine) log
        // in. Scoped to this one administrator's keys only (see clearPersonalUiState's own doc
        // comment) — must run before clearing `administrator.value` below, since it needs the id.
        if (administrator.value) clearPersonalUiState(administrator.value.id);
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
        reconnectingSince.value = null;
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
    }

    // Keeps retrying indefinitely (capped backoff) after adminApi's own bounded ~4.2s retry is
    // exhausted — a prolonged outage must never be mistaken for "logged out". Only a real HTTP
    // response (success or a confirmed-null activeAdministrator) ends the loop; a superseded
    // generation (login/logout/a fresh fetchActiveAdministrator call) also stops it silently.
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
                    // Vendure's activeAdministrator query never throws for "not logged in" — it
                    // returns a clean `null`, handled by applyResult above. ANY thrown error here
                    // (network failure, a transient GraphQL/DB error, anything) is therefore
                    // ambiguous, not a confirmed logout — keep retrying rather than assuming the
                    // caller is unauthenticated just because this one attempt errored.
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
            // Vendure's activeAdministrator query never throws for "not logged in" — a genuine
            // logout always comes back as a clean, successful `null` response, handled by
            // applyResult above. ANY thrown error here — a network failure (adminApi already
            // retried a couple of times, see ApiNetworkError's doc comment), a transient
            // GraphQL/DB error, anything — means we simply don't know the session's real state,
            // not that the user is logged out. Vendure sessions last a year by default, so the
            // cookie is almost certainly still valid — clearing `administrator` here would force
            // a real, logged-in user back to the login screen just because one request errored
            // (e.g. a dev restart, or a DB hiccup right as the server resumes from one). Status
            // stays 'unknown' and hands off to an indefinite background retry rather than
            // blocking this call (and whatever awaits it, e.g. the router guard).
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
