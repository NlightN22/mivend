<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { IconChevronDown } from '@tabler/icons-vue';
import { useAuthStore } from '../../stores/auth';
import { useFavoritesStore } from '../../stores/favorites';
import { useDocuments } from '../documents/useDocuments';
import { useProformaInvoices } from '../proforma-invoices/useProformaInvoices';
import { useOrders } from '../orders/useOrders';
import { useCompanyName } from './useCompanyName';
import { useTradingPoints } from './useTradingPoints';

const authStore = useAuthStore();
const route = useRoute();

// Sidebar is always expanded on desktop; on mobile it collapses to a single toggle bar so it
// doesn't push page content down by default (see AGENTS.md mobile-nav rules).
const mobileOpen = ref(false);
watch(
    () => route.path,
    () => {
        mobileOpen.value = false;
    },
);

const { totalItems: proformaInvoiceCount, load: loadProformaInvoices } = useProformaInvoices();
const { totalItems: orderCount, load: loadOrders } = useOrders();
const { totalItems: documentCount, load: loadDocuments } = useDocuments();
const { visiblePoints, loadPoints } = useTradingPoints();
const tradingPointCount = computed(() => visiblePoints.value.length);
const favoritesStore = useFavoritesStore();
const favoriteCount = computed(() => favoritesStore.count);
onMounted(() => {
    void loadOrders({ take: 1, skip: 0 });
    void loadDocuments({ take: 1, skip: 0 });
    void loadPoints();
    void loadProformaInvoices({ take: 1, skip: 0 });
});

const { companyName, initials } = useCompanyName();

const role = computed(() => authStore.customer?.customFields?.portalRole ?? '—');

const isActive = (path: string) => route.path === path;

const DOCUMENT_PATHS = ['/proforma-invoices', '/documents', '/reconciliation-acts'];
const inDocuments = computed(() => DOCUMENT_PATHS.some(p => route.path.startsWith(p)));
const documentsOpen = ref(inDocuments.value);
watch(inDocuments, inside => {
    if (inside) documentsOpen.value = true;
});
</script>

<template>
    <aside class="account-sidebar">
        <button
            type="button"
            class="account-sidebar__mobile-toggle"
            :aria-expanded="mobileOpen"
            @click="mobileOpen = !mobileOpen"
        >
            <span class="account-sidebar__mobile-toggle-icon">{{ mobileOpen ? '✕' : '☰' }}</span>
            <span>{{ companyName }}</span>
        </button>

        <div class="account-sidebar__body" :class="{ 'account-sidebar__body--open': mobileOpen }">
            <div class="account-sidebar__user-card">
                <div class="account-sidebar__avatar">{{ initials }}</div>
                <div>
                    <div class="account-sidebar__name">{{ companyName }}</div>
                    <div class="account-sidebar__role">{{ role }}</div>
                </div>
            </div>

            <div class="account-sidebar__section-title">Customer Zone</div>
            <nav class="account-sidebar__menu">
                <RouterLink
                    to="/account"
                    class="account-sidebar__link"
                    :class="{ 'account-sidebar__link--active': isActive('/account') }"
                >
                    <span>Home</span>
                </RouterLink>
                <RouterLink
                    to="/orders"
                    class="account-sidebar__link"
                    :class="{ 'account-sidebar__link--active': isActive('/orders') }"
                >
                    <span>Orders</span
                    ><span v-if="orderCount > 0" class="account-sidebar__count">{{
                        orderCount
                    }}</span>
                </RouterLink>
                <RouterLink
                    to="/settlements"
                    class="account-sidebar__link"
                    :class="{ 'account-sidebar__link--active': isActive('/settlements') }"
                >
                    <span>Account statement</span>
                </RouterLink>
                <button
                    type="button"
                    class="account-sidebar__link account-sidebar__group-toggle"
                    :class="{ 'account-sidebar__link--active': inDocuments && !documentsOpen }"
                    :aria-expanded="documentsOpen"
                    @click="documentsOpen = !documentsOpen"
                >
                    <span>Documents</span>
                    <IconChevronDown
                        :size="16"
                        class="account-sidebar__chevron"
                        :class="{ 'account-sidebar__chevron--open': documentsOpen }"
                    />
                </button>
                <div v-show="documentsOpen" class="account-sidebar__submenu">
                    <RouterLink
                        to="/proforma-invoices"
                        class="account-sidebar__link account-sidebar__link--sub"
                        :class="{ 'account-sidebar__link--active': isActive('/proforma-invoices') }"
                    >
                        <span>Proforma invoices</span
                        ><span v-if="proformaInvoiceCount > 0" class="account-sidebar__count">{{
                            proformaInvoiceCount
                        }}</span>
                    </RouterLink>
                    <RouterLink
                        to="/documents"
                        class="account-sidebar__link account-sidebar__link--sub"
                        :class="{ 'account-sidebar__link--active': isActive('/documents') }"
                    >
                        <span>Contracts and files</span
                        ><span v-if="documentCount > 0" class="account-sidebar__count">{{
                            documentCount
                        }}</span>
                    </RouterLink>
                    <RouterLink
                        to="/reconciliation-acts"
                        class="account-sidebar__link account-sidebar__link--sub"
                        :class="{
                            'account-sidebar__link--active': isActive('/reconciliation-acts'),
                        }"
                    >
                        <span>Reconciliation acts</span>
                    </RouterLink>
                </div>
                <RouterLink
                    to="/favorites"
                    class="account-sidebar__link"
                    :class="{ 'account-sidebar__link--active': isActive('/favorites') }"
                >
                    <span>Favorites</span
                    ><span v-if="favoriteCount > 0" class="account-sidebar__count">{{
                        favoriteCount
                    }}</span>
                </RouterLink>
                <RouterLink
                    to="/requests"
                    class="account-sidebar__link"
                    :class="{ 'account-sidebar__link--active': isActive('/requests') }"
                >
                    <span>Requests</span>
                </RouterLink>
            </nav>

            <div class="account-sidebar__section-title">Company</div>
            <nav class="account-sidebar__menu">
                <RouterLink
                    to="/account/trading-points"
                    class="account-sidebar__link"
                    :class="{
                        'account-sidebar__link--active': isActive('/account/trading-points'),
                    }"
                >
                    <span>Trading points</span
                    ><span v-if="tradingPointCount > 0" class="account-sidebar__count">{{
                        tradingPointCount
                    }}</span>
                </RouterLink>
                <RouterLink
                    to="/account/balance"
                    class="account-sidebar__link"
                    :class="{ 'account-sidebar__link--active': isActive('/account/balance') }"
                >
                    <span>Balance &amp; Limits</span>
                </RouterLink>
                <RouterLink
                    to="/account/employees"
                    class="account-sidebar__link"
                    :class="{ 'account-sidebar__link--active': isActive('/account/employees') }"
                >
                    <span>Employees</span>
                </RouterLink>
                <RouterLink
                    to="/account/settings"
                    class="account-sidebar__link"
                    :class="{ 'account-sidebar__link--active': isActive('/account/settings') }"
                >
                    <span>Settings</span>
                </RouterLink>
                <RouterLink
                    to="/account/notifications"
                    class="account-sidebar__link"
                    :class="{ 'account-sidebar__link--active': isActive('/account/notifications') }"
                >
                    <span>Notifications</span>
                </RouterLink>
            </nav>
        </div>
    </aside>
</template>

<style scoped>
.account-sidebar {
    position: sticky;
    top: 118px;
    background: #fff;
    border: 1px solid rgba(221, 231, 226, 0.86);
    border-radius: 28px;
    box-shadow: 0 14px 36px rgba(27, 45, 38, 0.08);
    padding: 20px;
}

.account-sidebar__user-card {
    display: flex;
    align-items: center;
    gap: 12px;
    padding-bottom: 18px;
    margin-bottom: 18px;
    border-bottom: 1px solid #edf2ef;
}

.account-sidebar__avatar {
    width: 70px;
    height: 70px;
    border-radius: 50%;
    background: linear-gradient(145deg, #e2f8ef, #f4fbff);
    color: #008a64;
    display: grid;
    place-items: center;
    font-size: 25px;
    font-weight: 950;
    flex-shrink: 0;
}

.account-sidebar__name {
    font-weight: 950;
    letter-spacing: -0.03em;
    font-size: 18px;
    margin-bottom: 4px;
}

.account-sidebar__role {
    color: #66736e;
    font-size: 13px;
    line-height: 1.3;
}

.account-sidebar__section-title {
    margin: 18px 0 8px;
    color: #263732;
    font-size: 13px;
    font-weight: 950;
    text-transform: uppercase;
    letter-spacing: 0.035em;
}

.account-sidebar__menu {
    display: grid;
    gap: 4px;
}

.account-sidebar__link {
    min-height: 38px;
    padding: 0 10px;
    border-radius: 11px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    color: #263732;
    font-weight: 750;
    font-size: 14px;
    text-decoration: none;
}

.account-sidebar__group-toggle {
    width: 100%;
    border: 0;
    background: transparent;
    font-family: inherit;
    cursor: pointer;
    text-align: left;
}

.account-sidebar__chevron {
    flex: 0 0 auto;
    transition: transform 0.14s ease;
}

.account-sidebar__chevron--open {
    transform: rotate(180deg);
}

.account-sidebar__submenu {
    display: grid;
    gap: 2px;
}

.account-sidebar__link--sub {
    padding-left: 22px;
}

.account-sidebar__link:hover {
    background: #f4faf7;
}

.account-sidebar__link--active {
    background: #e2f8ef;
    color: #008a64;
    font-weight: 950;
}

.account-sidebar__count {
    min-width: 22px;
    height: 22px;
    border-radius: 999px;
    display: grid;
    place-items: center;
    background: #eef4f1;
    color: #66736e;
    font-size: 12px;
    font-weight: 900;
}

.account-sidebar__mobile-toggle {
    display: none;
}

@media (max-width: 960px) {
    .account-sidebar {
        position: static;
        padding: 12px 16px;
    }

    .account-sidebar__mobile-toggle {
        width: 100%;
        display: flex;
        align-items: center;
        gap: 10px;
        border: 0;
        background: transparent;
        padding: 6px 2px;
        font-weight: 900;
        font-size: 15px;
        color: #263732;
    }

    .account-sidebar__mobile-toggle-icon {
        width: 32px;
        height: 32px;
        border-radius: 10px;
        background: #f4faf7;
        color: #008a64;
        display: grid;
        place-items: center;
        font-size: 16px;
        flex-shrink: 0;
    }

    .account-sidebar__body {
        display: none;
        margin-top: 14px;
        padding-top: 14px;
        border-top: 1px solid #edf2ef;
    }

    .account-sidebar__body--open {
        display: block;
    }
}
</style>
