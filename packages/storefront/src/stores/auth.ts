import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { shopApi } from '../api/client';
import {
    ActiveCustomerForAuthDocument,
    LoginDocument,
    LogoutFromAuthStoreDocument,
    type ActiveCustomerForAuthQuery,
} from '../api/generated/graphql';

type ActiveCustomer = NonNullable<ActiveCustomerForAuthQuery['activeCustomer']>;

type AuthStatus = 'unknown' | 'authenticated' | 'unauthenticated';

// Outages can outlast shopApi's ~4.2s retry; a network failure is not a logged-out signal.
const BACKGROUND_RETRY_INITIAL_MS = 2_000;
const BACKGROUND_RETRY_MAX_MS = 20_000;
const HEARTBEAT_INTERVAL_MS = 60_000;

export const useAuthStore = defineStore('auth', () => {
    const customer = ref<ActiveCustomer | null>(null);
    const initialized = ref(false);
    // 'unknown' also covers retrying after a network failure: only a confirmed 'unauthenticated'
    // counts as logged out, so an outage never force-logs-out a still-valid session.
    const authStatus = ref<AuthStatus>('unknown');
    const isReconnecting = ref(false);
    const reconnectingSince = ref<number | null>(null);
    let initPromise: Promise<void> | null = null;
    // Bumped on every fetchCurrentCustomer()/login()/logout() call so a stale background retry
    // loop from an earlier call can detect it's been superseded and stop touching state.
    let generation = 0;
    let backgroundRetryTimer: ReturnType<typeof setTimeout> | null = null;
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

    const isLoggedIn = computed(() => customer.value !== null);

    const portalRole = computed(() => customer.value?.customFields?.portalRole ?? null);
    const isClientAdmin = computed(() => portalRole.value === 'client_admin');
    const isBuyer = computed(() => portalRole.value === 'buyer');
    const isAccountant = computed(() => portalRole.value === 'accountant');
    const isObserver = computed(() => portalRole.value === 'observer');

    const tradingPoint = computed(() => customer.value?.preferredTradingPoint ?? null);
    const counterparty = computed(() => customer.value?.counterparty ?? null);

    function init(): Promise<void> {
        if (!initPromise) {
            initPromise = fetchCurrentCustomer().finally(() => {
                initialized.value = true;
            });
        }
        return initPromise;
    }

    const LOGGED_OUT_KEY = 'mv_logged_out';

    async function login(username: string, password: string, rememberMe = false): Promise<boolean> {
        const result = await shopApi(LoginDocument, { username, password, rememberMe });

        if (result.login.__typename === 'CurrentUser') {
            sessionStorage.removeItem(LOGGED_OUT_KEY);
            initPromise = null;
            generation++;
            stopBackgroundRetry();
            await fetchCurrentCustomer();
            return true;
        }
        return false;
    }

    async function logout(): Promise<void> {
        try {
            await shopApi(LogoutFromAuthStoreDocument);
        } catch (e) {
            console.warn('[auth] logout mutation failed:', e);
        }
        generation++;
        stopBackgroundRetry();
        stopHeartbeat();
        customer.value = null;
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

    function startHeartbeat(): void {
        if (heartbeatTimer !== null) return;
        heartbeatTimer = setInterval(() => {
            void fetchCurrentCustomer();
        }, HEARTBEAT_INTERVAL_MS);
    }

    function stopHeartbeat(): void {
        if (heartbeatTimer !== null) {
            clearInterval(heartbeatTimer);
            heartbeatTimer = null;
        }
    }

    function applyResult(myGeneration: number, result: ActiveCustomerForAuthQuery): void {
        if (myGeneration !== generation) return; // superseded by a later call
        customer.value = result.activeCustomer ?? null;
        authStatus.value = result.activeCustomer ? 'authenticated' : 'unauthenticated';
        isReconnecting.value = false;
        if (result.activeCustomer) startHeartbeat();
        else stopHeartbeat();
    }

    // Only a real HTTP response ends the loop; a prolonged outage must never look like logged out.
    // A superseded generation (login/logout/new fetch) also stops it silently.
    function scheduleBackgroundRetry(myGeneration: number, delayMs: number): void {
        backgroundRetryTimer = setTimeout(() => {
            if (myGeneration !== generation) return;
            shopApi(ActiveCustomerForAuthDocument)
                .then(result => {
                    if (myGeneration !== generation) return;
                    applyResult(myGeneration, result);
                })
                .catch(() => {
                    if (myGeneration !== generation) return;
                    // Vendure's activeCustomer returns null (not an error) when logged out, so any thrown error
                    // is ambiguous: retry rather than treat it as unauthenticated.
                    scheduleBackgroundRetry(
                        myGeneration,
                        Math.min(delayMs * 2, BACKGROUND_RETRY_MAX_MS),
                    );
                });
        }, delayMs);
    }

    async function fetchCurrentCustomer(): Promise<void> {
        generation++;
        const myGeneration = generation;
        stopBackgroundRetry();

        // Guard against server-side session surviving after explicit logout
        if (sessionStorage.getItem(LOGGED_OUT_KEY)) {
            customer.value = null;
            authStatus.value = 'unauthenticated';
            return;
        }
        try {
            const result = await shopApi(ActiveCustomerForAuthDocument);
            applyResult(myGeneration, result);
        } catch {
            // A thrown error means the session state is unconfirmed, not that the customer is logged out.
            // Status stays 'unknown' and retries in the background instead of blocking the route guard.
            isReconnecting.value = true;
            reconnectingSince.value = Date.now();
            scheduleBackgroundRetry(myGeneration, BACKGROUND_RETRY_INITIAL_MS);
        }
    }

    return {
        customer,
        initialized,
        isLoggedIn,
        authStatus,
        isReconnecting,
        reconnectingSince,
        init,
        portalRole,
        isClientAdmin,
        isBuyer,
        isAccountant,
        isObserver,
        tradingPoint,
        counterparty,
        login,
        logout,
        fetchCurrentCustomer,
    };
});
