import { Ref, ref } from 'vue';
import { useLatestRequest } from '@mivend/ui-kit';
import { tr } from '../utils/lazyLabels';
import {
    fetchAdministratorOptions,
    fetchVisibilityGrants,
    grantManagerVisibility,
    revokeVisibilityGrant,
    type AdministratorOption,
    type GrantInput,
    type VisibilityGrantRow,
} from '../api/visibilityGrants';
import { VisibilityGrantFieldsFragment } from '../api/generated/graphql';

export interface UseVisibilityGrants {
    rows: Ref<VisibilityGrantFieldsFragment[]>;
    totalItems: Ref<number>;
    page: Ref<number>;
    pageSize: Ref<number>;
    status: Ref<string>;
    search: Ref<string>;
    error: Ref<string>;
    loading: Ref<boolean>;
    administrators: Ref<AdministratorOption[]>;
    load: () => Promise<void>;
    loadAdministrators: () => Promise<void>;
    grant: (input: GrantInput) => Promise<boolean>;
    revoke: (id: string, reason: string) => Promise<void>;
}

export function useVisibilityGrants(): UseVisibilityGrants {
    const rows = ref<VisibilityGrantRow[]>([]);
    const totalItems = ref(0);
    const page = ref(1);
    const pageSize = ref(20);
    const status = ref('');
    const search = ref('');
    const error = ref('');
    const administrators = ref<AdministratorOption[]>([]);

    const { loading, run } = useLatestRequest(
        () =>
            fetchVisibilityGrants({
                skip: (page.value - 1) * pageSize.value,
                take: pageSize.value,
                status: status.value,
                search: search.value,
            }),
        result => {
            rows.value = result.items;
            totalItems.value = result.totalItems;
        },
    );

    async function load(): Promise<void> {
        try {
            await run();
        } catch (e) {
            error.value = e instanceof Error ? e.message : tr('settingsAccess.grants.loadFailed');
        }
    }

    async function loadAdministrators(): Promise<void> {
        administrators.value = await fetchAdministratorOptions();
    }

    // Returns true on success so the caller can close its form; the server message is shown as is.
    async function grant(input: GrantInput): Promise<boolean> {
        error.value = '';
        try {
            await grantManagerVisibility(input);
            await run();
            return true;
        } catch (e) {
            error.value = e instanceof Error ? e.message : tr('settingsAccess.grants.saveFailed');
            return false;
        }
    }

    async function revoke(id: string, reason: string): Promise<void> {
        error.value = '';
        try {
            await revokeVisibilityGrant(id, reason);
            await run();
        } catch (e) {
            error.value = e instanceof Error ? e.message : tr('settingsAccess.grants.revokeFailed');
        }
    }

    return {
        rows,
        totalItems,
        page,
        pageSize,
        status,
        search,
        error,
        loading,
        administrators,
        load,
        loadAdministrators,
        grant,
        revoke,
    };
}
