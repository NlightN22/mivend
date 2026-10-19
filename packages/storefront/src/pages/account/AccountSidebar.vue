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

interface NavItem {
    to: string;
    key: string;
    count?: number;
}
const customerLinks = computed<NavItem[]>(() => [
    { to: '/account', key: 'home' },
    { to: '/orders', key: 'orders', count: orderCount.value },
    { to: '/settlements', key: 'statement' },
]);
const documentLinks = computed<NavItem[]>(() => [
    { to: '/proforma-invoices', key: 'proformaInvoices', count: proformaInvoiceCount.value },
    { to: '/documents', key: 'contracts', count: documentCount.value },
    { to: '/reconciliation-acts', key: 'reconciliationActs' },
]);
const afterDocumentLinks = computed<NavItem[]>(() => [
    { to: '/favorites', key: 'favorites', count: favoriteCount.value },
    { to: '/requests', key: 'requests' },
]);
const companyLinks = computed<NavItem[]>(() => [
    { to: '/account/trading-points', key: 'tradingPoints', count: tradingPointCount.value },
    { to: '/account/balance', key: 'balance' },
    { to: '/account/employees', key: 'employees' },
    { to: '/account/settings', key: 'settings' },
    { to: '/account/notifications', key: 'notifications' },
]);

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
            :aria-label="$t('accountNav.menu')"
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

            <div class="account-sidebar__section-title">{{ $t('accountNav.customerZone') }}</div>
            <nav class="account-sidebar__menu">
                <RouterLink
                    v-for="link in customerLinks"
                    :key="link.to"
                    :to="link.to"
                    class="account-sidebar__link"
                    :class="{ 'account-sidebar__link--active': isActive(link.to) }"
                >
                    <span>{{ $t(`accountNav.${link.key}`) }}</span
                    ><span v-if="link.count" class="account-sidebar__count">{{ link.count }}</span>
                </RouterLink>
                <button
                    type="button"
                    class="account-sidebar__link account-sidebar__group-toggle"
                    :class="{ 'account-sidebar__link--active': inDocuments && !documentsOpen }"
                    :aria-expanded="documentsOpen"
                    @click="documentsOpen = !documentsOpen"
                >
                    <span>{{ $t('accountNav.documents') }}</span>
                    <IconChevronDown
                        :size="16"
                        class="account-sidebar__chevron"
                        :class="{ 'account-sidebar__chevron--open': documentsOpen }"
                    />
                </button>
                <div v-show="documentsOpen" class="account-sidebar__submenu">
                    <RouterLink
                        v-for="link in documentLinks"
                        :key="link.to"
                        :to="link.to"
                        class="account-sidebar__link account-sidebar__link--sub"
                        :class="{ 'account-sidebar__link--active': isActive(link.to) }"
                    >
                        <span>{{ $t(`accountNav.${link.key}`) }}</span
                        ><span v-if="link.count" class="account-sidebar__count">{{
                            link.count
                        }}</span>
                    </RouterLink>
                </div>
                <RouterLink
                    v-for="link in afterDocumentLinks"
                    :key="link.to"
                    :to="link.to"
                    class="account-sidebar__link"
                    :class="{ 'account-sidebar__link--active': isActive(link.to) }"
                >
                    <span>{{ $t(`accountNav.${link.key}`) }}</span
                    ><span v-if="link.count" class="account-sidebar__count">{{ link.count }}</span>
                </RouterLink>
            </nav>

            <div class="account-sidebar__section-title">{{ $t('accountNav.company') }}</div>
            <nav class="account-sidebar__menu">
                <RouterLink
                    v-for="link in companyLinks"
                    :key="link.to"
                    :to="link.to"
                    class="account-sidebar__link"
                    :class="{ 'account-sidebar__link--active': isActive(link.to) }"
                >
                    <span>{{ $t(`accountNav.${link.key}`) }}</span
                    ><span v-if="link.count" class="account-sidebar__count">{{ link.count }}</span>
                </RouterLink>
            </nav>
        </div>
    </aside>
</template>

<style scoped src="./AccountSidebar.css"></style>
