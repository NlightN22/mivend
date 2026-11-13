import { computed, onBeforeUnmount, onMounted, ref, type ComputedRef } from 'vue';
import { useAuthStore } from '../stores/auth';
import { useTabSync } from './useTabSync';

export type CustomerDetailTab =
    | 'overview'
    | 'orders'
    | 'proformaInvoices'
    | 'settlements'
    | 'discounts'
    | 'documents'
    | 'team'
    | 'portalUsers'
    | 'history'
    | 'changeJournal';

export const CUSTOMER_DETAIL_TABS: CustomerDetailTab[] = [
    'overview',
    'orders',
    'proformaInvoices',
    'settlements',
    'discounts',
    'documents',
    'team',
    'portalUsers',
    'history',
    'changeJournal',
];

// Same breakpoint as MvAppTopbar/MvAppMobileNav's own mobile switch.
const MOBILE_BREAKPOINT = '(max-width: 800px)';
const PRIMARY_TAB_COUNT = 3;

export interface CustomerDetailTabs {
    activeTab: ComputedRef<CustomerDetailTab>;
    primaryTabs: ComputedRef<CustomerDetailTab[]>;
    overflowTabs: ComputedRef<CustomerDetailTab[]>;
    selectTab: (tab: CustomerDetailTab) => void;
}

export function useCustomerDetailTabs(): CustomerDetailTabs {
    const authStore = useAuthStore();
    const { activeTab: requestedTab, selectTab } = useTabSync<CustomerDetailTab>(
        CUSTOMER_DETAIL_TABS,
        'overview',
    );

    const mobileQuery = window.matchMedia(MOBILE_BREAKPOINT);
    const isMobile = ref(mobileQuery.matches);
    const handleChange = (e: MediaQueryListEvent): void => {
        isMobile.value = e.matches;
    };
    onMounted(() => mobileQuery.addEventListener('change', handleChange));
    onBeforeUnmount(() => mobileQuery.removeEventListener('change', handleChange));

    const visibleTabs = computed(() =>
        CUSTOMER_DETAIL_TABS.filter(
            t => t !== 'history' || authStore.hasPermission('ReadEntityHistory'),
        )
            .filter(t => t !== 'changeJournal' || authStore.hasPermission('ReadChangeJournal'))
            .filter(t => t !== 'settlements' || authStore.hasPermission('ReadSettlementDocument'))
            .filter(
                t =>
                    t !== 'portalUsers' ||
                    authStore.hasPermission('ManageCounterpartyPortalAccess'),
            ),
    );
    const primaryTabs = computed(() =>
        isMobile.value ? visibleTabs.value.slice(0, PRIMARY_TAB_COUNT) : visibleTabs.value,
    );
    const overflowTabs = computed(() =>
        isMobile.value ? visibleTabs.value.slice(PRIMARY_TAB_COUNT) : [],
    );
    // A tab the person may not open (e.g. ?tab=settlements without the permission) falls back to the overview.
    const activeTab = computed<CustomerDetailTab>(() =>
        visibleTabs.value.includes(requestedTab.value) ? requestedTab.value : 'overview',
    );

    return { activeTab, primaryTabs, overflowTabs, selectTab };
}
