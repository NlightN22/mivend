import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { shopApi } from '../api/client';

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

export const useAuthStore = defineStore('auth', () => {
    const customer = ref<ActiveCustomer | null>(null);

    const isLoggedIn = computed(() => customer.value !== null);

    const portalRole = computed(() => customer.value?.customFields?.portalRole ?? null);
    const isClientAdmin = computed(() => portalRole.value === 'client_admin');
    const isBuyer = computed(() => portalRole.value === 'buyer');
    const isAccountant = computed(() => portalRole.value === 'accountant');
    const isObserver = computed(() => portalRole.value === 'observer');

    const tradingPoint = computed(() => customer.value?.preferredTradingPoint ?? null);
    const counterparty = computed(() => customer.value?.counterparty ?? null);

    async function login(username: string, password: string): Promise<boolean> {
        const result = await shopApi<{
            login: {
                __typename: string;
                errorCode?: string;
                id?: string;
            };
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
            await fetchCurrentCustomer();
            return true;
        }
        return false;
    }

    async function logout(): Promise<void> {
        await shopApi(`mutation { logout { success } }`);
        customer.value = null;
    }

    async function fetchCurrentCustomer(): Promise<void> {
        try {
            const result = await shopApi<{ activeCustomer: ActiveCustomer | null }>(
                `{
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
                }`,
            );
            customer.value = result.activeCustomer;
        } catch {
            customer.value = null;
        }
    }

    return {
        customer,
        isLoggedIn,
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
