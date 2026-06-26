import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { shopApi } from '../api/client';

export const useAuthStore = defineStore('auth', () => {
    const customer = ref<{
        id: string;
        firstName: string;
        lastName: string;
        emailAddress: string;
    } | null>(null);

    const isLoggedIn = computed(() => customer.value !== null);

    async function login(username: string, password: string): Promise<boolean> {
        const result = await shopApi<{
            login: {
                __typename: string;
                errorCode?: string;
                id?: string;
                firstName?: string;
                lastName?: string;
                emailAddress?: string;
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
        const result = await shopApi<{ activeCustomer: typeof customer.value }>(
            `{ activeCustomer { id firstName lastName emailAddress } }`,
        );
        customer.value = result.activeCustomer;
    }

    return { customer, isLoggedIn, login, logout, fetchCurrentCustomer };
});
