import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { shopApi, ApiNetworkError } from '../api/client';

interface CustomerCounterparty {
    id: string;
    erpId: string;
    legalName: string;
    shortName: string;
    inn: string | null;
    creditLimit: number;
    creditBalance: number;
    paymentDelayDays: number;
    priceType: string;
}

interface CustomerTradingPoint {
    id: string;
    name: string;
    address: string;
    workingHours: string | null;
    deliveryComment: string | null;
}

interface ActiveCustomer {
    id: string;
    firstName: string;
    lastName: string;
    emailAddress: string;
    customFields: {
        portalRole: string | null;
        preferredTradingPointId: string | null;
    };
    counterparty: CustomerCounterparty | null;
    preferredTradingPoint: CustomerTradingPoint | null;
}

type AuthStatus = 'unknown' | 'authenticated' | 'unauthenticated';

// Background retry tuning for a network outage that outlasts shopApi's own bounded ~4.2s
// retry (see api/client.ts) — capped exponential backoff, retried indefinitely rather than
// ever concluding "logged out" from a network failure alone. See AGENTS.md's "A fetch()
// network failure is not the same as 'logged out'" gotcha.
const BACKGROUND_RETRY_INITIAL_MS = 2_000;
const BACKGROUND_RETRY_MAX_MS = 20_000;

const ACTIVE_CUSTOMER_QUERY = `
    {
        activeCustomer {
            id firstName lastName emailAddress
            customFields { portalRole preferredTradingPointId }
            counterparty {
                id erpId legalName shortName inn
                creditLimit creditBalance paymentDelayDays priceType
            }
            preferredTradingPoint {
                id name address workingHours deliveryComment
            }
        }
    }
`;

export const useAuthStore = defineStore('auth', () => {
    const customer = ref<ActiveCustomer | null>(null);
    const initialized = ref(false);
    // Tri-state, distinct from `customer`/`isLoggedIn`: 'unknown' covers both "not yet checked"
    // and "currently retrying after a network failure" — callers (route guard, App.vue's DEV
    // auto-relogin fallback) only treat a *confirmed* 'unauthenticated' as "not logged in",
    // never 'unknown', so a prolonged outage never force-logs-out a still-valid session.
    const authStatus = ref<AuthStatus>('unknown');
    const isReconnecting = ref(false);
    let initPromise: Promise<void> | null = null;
    // Bumped on every fetchCurrentCustomer()/login()/logout() call so a stale background retry
    // loop from an earlier call can detect it's been superseded and stop touching state.
    let generation = 0;
    let backgroundRetryTimer: ReturnType<typeof setTimeout> | null = null;

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
        const result = await shopApi<{
            login: {
                __typename: string;
                errorCode?: string;
                id?: string;
            };
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
            await fetchCurrentCustomer();
            return true;
        }
        return false;
    }

    async function logout(): Promise<void> {
        try {
            await shopApi<{ logout: { success: boolean } }>(`mutation { logout { success } }`);
        } catch (e) {
            console.warn('[auth] logout mutation failed:', e);
        }
        generation++;
        stopBackgroundRetry();
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
    }

    function applyResult(
        myGeneration: number,
        result: { activeCustomer: ActiveCustomer | null },
    ): void {
        if (myGeneration !== generation) return; // superseded by a later call
        customer.value = result.activeCustomer;
        authStatus.value = result.activeCustomer ? 'authenticated' : 'unauthenticated';
        isReconnecting.value = false;
    }

    // Keeps retrying indefinitely (capped backoff) after shopApi's own bounded ~4.2s retry is
    // exhausted — a prolonged outage must never be mistaken for "logged out". Only a real HTTP
    // response (success or a confirmed-null activeCustomer) ends the loop; a superseded
    // generation (login/logout/a fresh fetchCurrentCustomer call) also stops it silently.
    function scheduleBackgroundRetry(myGeneration: number, delayMs: number): void {
        backgroundRetryTimer = setTimeout(() => {
            if (myGeneration !== generation) return;
            shopApi<{ activeCustomer: ActiveCustomer | null }>(ACTIVE_CUSTOMER_QUERY)
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
                        customer.value = null;
                        authStatus.value = 'unauthenticated';
                        isReconnecting.value = false;
                    }
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
            const result = await shopApi<{ activeCustomer: ActiveCustomer | null }>(
                ACTIVE_CUSTOMER_QUERY,
            );
            applyResult(myGeneration, result);
        } catch (e) {
            // See the manager portal's identical fetchActiveAdministrator comment — a network
            // failure (shopApi already retried) doesn't mean the customer is logged out, only
            // that we couldn't confirm either way. Vendure sessions last a year by default. A
            // network failure keeps status 'unknown' and hands off to an indefinite background
            // retry rather than blocking this call (and whatever awaits it, e.g. App.vue/the
            // route guard).
            if (!(e instanceof ApiNetworkError)) {
                customer.value = null;
                authStatus.value = 'unauthenticated';
                return;
            }
            isReconnecting.value = true;
            scheduleBackgroundRetry(myGeneration, BACKGROUND_RETRY_INITIAL_MS);
        }
    }

    return {
        customer,
        initialized,
        isLoggedIn,
        authStatus,
        isReconnecting,
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
