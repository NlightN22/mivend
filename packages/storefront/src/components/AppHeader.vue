<script setup lang="ts">
import { formatMoney } from '../i18n/format';
import { ref, shallowRef, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { IconClipboardList, IconHeart, IconUser } from '@tabler/icons-vue';
import { MvLanguageSwitcher, MvNotificationBell, MvNotificationPanel } from '@mivend/ui-kit';
import { useLanguageSwitcher } from '../composables/useLanguageSwitcher';
import { useHeaderSearch } from '../composables/useHeaderSearch';
import { useNotificationPanelLabels } from '../composables/useNotificationPanelLabels';
import { useAuthStore } from '../stores/auth';
import { useCartStore } from '../stores/cart';
import { useCatalogStore } from '../stores/catalog';
import { useFavoritesStore } from '../stores/favorites';
import { useNotificationsStore } from '../stores/notifications';

const router = useRouter();
const route = useRoute();
const { t } = useI18n();
const language = useLanguageSwitcher();
const authStore = useAuthStore();
const cartStore = useCartStore();
const catalogStore = useCatalogStore();
const favoritesStore = useFavoritesStore();
const notificationPanelOpen = ref(false);
const notificationLabels = useNotificationPanelLabels();
const {
    searchQuery,
    scopeLabel,
    suggestions,
    onSelectSuggestion,
    onSearch: search,
    onRemoveScope,
} = useHeaderSearch();

// The header also renders for guests, and notifications require a signed-in customer.
const notificationsStore = shallowRef<ReturnType<typeof useNotificationsStore> | null>(null);
watch(
    () => authStore.isLoggedIn,
    loggedIn => {
        if (loggedIn && !notificationsStore.value) {
            notificationsStore.value = useNotificationsStore();
        }
    },
    { immediate: true },
);

const catalogOpen = ref(false);
const mobileNavOpen = ref(false);

// These pages render AccountSidebar, which already lists Account/Orders/Favourites.
const ACCOUNT_ZONE_PREFIXES = [
    '/account',
    '/orders',
    '/documents',
    '/proforma-invoices',
    '/settlements',
    '/reconciliation-acts',
    '/favorites',
    '/requests',
];
const inAccountZone = computed(() =>
    ACCOUNT_ZONE_PREFIXES.some(
        prefix => route.path === prefix || route.path.startsWith(`${prefix}/`),
    ),
);

const cartTotal = computed(() => {
    if (!cartStore.loaded) return '';
    return formatMoney(cartStore.totalPrice, 'RUB');
});

function onSearch(value: string): void {
    catalogOpen.value = false;
    search(value);
}

function toggleCatalog(): void {
    if (!catalogOpen.value) {
        catalogStore.loadCollections();
    }
    catalogOpen.value = !catalogOpen.value;
}

function closeCatalog(): void {
    catalogOpen.value = false;
}

function toggleMobileNav(): void {
    mobileNavOpen.value = !mobileNavOpen.value;
}

function closeAll(): void {
    closeCatalog();
    mobileNavOpen.value = false;
}

function onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') closeAll();
}

watch(
    () => route.fullPath,
    () => closeAll(),
);

onMounted(() => {
    document.addEventListener('keydown', onKeydown);
    catalogStore.loadCollections();
});
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown));
</script>

<template>
    <div class="app-header-wrap" :class="{ 'app-header-wrap--open': catalogOpen || mobileNavOpen }">
        <div v-if="authStore.isLoggedIn" class="app-header__strip">
            <div class="app-header__strip-inner">
                <i18n-t keypath="header.tagline" tag="span">
                    <template #portal>
                        <strong>{{ t('header.portal') }}</strong>
                    </template>
                </i18n-t>
                <span>{{ t('header.liveStock') }}</span>
            </div>
        </div>

        <header class="app-header">
            <div class="app-header__inner">
                <RouterLink to="/" class="app-header__logo-link" :aria-label="t('nav.home')">
                    <MvLogo name="mivend" size="md" />
                </RouterLink>

                <button
                    :class="[
                        'app-header__catalog-btn',
                        { 'app-header__catalog-btn--open': catalogOpen },
                    ]"
                    type="button"
                    @click="toggleCatalog"
                >
                    <span>{{ catalogOpen ? '✕' : '☰' }}</span> {{ t('nav.catalog') }}
                </button>

                <div class="app-header__search">
                    <MvSearchInput
                        v-model="searchQuery"
                        :placeholder="t('header.searchPlaceholder')"
                        :button-label="t('search.button')"
                        :open-search-label="t('search.open')"
                        :clear-label="t('search.clear')"
                        :remove-scope-label="t('search.removeScope')"
                        :empty-text="(query: string) => t('search.noResults', { query })"
                        :suggestions="suggestions"
                        :scope-label="scopeLabel"
                        @remove-scope="onRemoveScope"
                        @search="onSearch"
                        @select="onSelectSuggestion"
                    />
                </div>

                <nav
                    class="app-header__nav"
                    :class="{
                        'app-header__nav--open': mobileNavOpen,
                        'app-header__nav--in-zone': inAccountZone,
                    }"
                >
                    <template v-if="authStore.isLoggedIn">
                        <RouterLink
                            to="/account"
                            class="app-header__nav-btn app-header__nav-btn--zone-dup"
                        >
                            <IconUser :size="20" aria-hidden="true" />
                            <span>{{ t('nav.account') }}</span>
                        </RouterLink>
                        <RouterLink
                            to="/orders"
                            class="app-header__nav-btn app-header__nav-btn--zone-dup"
                        >
                            <IconClipboardList :size="20" aria-hidden="true" />
                            <span>{{ t('nav.orders') }}</span>
                        </RouterLink>
                        <RouterLink
                            to="/favorites"
                            class="app-header__nav-btn app-header__nav-btn--zone-dup"
                        >
                            <span class="app-header__nav-icon-wrap">
                                <IconHeart :size="20" aria-hidden="true" />
                                <span
                                    v-if="favoritesStore.count > 0"
                                    class="app-header__fav-badge"
                                    >{{ favoritesStore.count }}</span
                                >
                            </span>
                            <span>{{ t('nav.favourites') }}</span>
                        </RouterLink>
                    </template>

                    <template v-else>
                        <RouterLink to="/login" class="app-header__nav-btn">
                            <IconUser :size="20" aria-hidden="true" />
                            <span>{{ t('nav.signIn') }}</span>
                        </RouterLink>
                    </template>
                </nav>

                <MvLanguageSwitcher
                    class="app-header__language"
                    :model-value="language.locale.value"
                    :options="language.options"
                    :aria-label="t('common.language')"
                    @update:model-value="language.select"
                />

                <MvNotificationBell
                    v-if="notificationsStore"
                    :unread-count="notificationsStore.unreadCount"
                    :aria-label="t('notifications.title')"
                    @click="notificationPanelOpen = !notificationPanelOpen"
                />

                <RouterLink v-if="authStore.isLoggedIn" to="/cart" class="app-header__cart">
                    <span>&#128722;</span>
                    <span class="app-header__cart-text">
                        <small>{{ t('nav.cart') }}</small>
                        {{ cartTotal }}
                    </span>
                    <span v-if="cartStore.loaded" class="app-header__cart-badge">{{
                        cartStore.itemCount
                    }}</span>
                </RouterLink>

                <button
                    type="button"
                    class="app-header__hamburger"
                    :class="{ 'app-header__hamburger--open': mobileNavOpen }"
                    :aria-label="t('nav.menu')"
                    @click="toggleMobileNav"
                >
                    <span></span><span></span><span></span>
                </button>
            </div>

            <div v-if="authStore.isLoggedIn" class="app-header__delivery">
                <span class="app-header__delivery-line">
                    <template v-if="authStore.tradingPoint">
                        {{ t('header.tradingPoint') }} &middot;
                        <strong>{{ authStore.tradingPoint.name }}</strong>
                        <span class="app-header__delivery-address"
                            >&nbsp;— {{ authStore.tradingPoint.address }}</span
                        >
                    </template>
                    <template v-else>
                        <span class="app-header__delivery-hint">{{
                            t('header.noTradingPoint')
                        }}</span>
                    </template>
                </span>
            </div>

            <MvCatalogDropdown
                :collections="catalogStore.collections"
                :open="catalogOpen"
                :loading="catalogStore.loading"
                :more-label="t('catalogNav.more')"
                :less-label="t('catalogNav.less')"
                :loading-label="t('catalogNav.loading')"
                :empty-label="t('catalogNav.empty')"
                @close="closeCatalog"
            />
        </header>

        <div
            v-if="notificationPanelOpen && notificationsStore"
            class="app-header__notification-panel"
        >
            <MvNotificationPanel
                :notifications="notificationsStore.notifications"
                :loading="notificationsStore.loading"
                :labels="notificationLabels"
                @mark-read="notificationsStore.markRead"
                @resolve="notificationsStore.resolve"
                @close="notificationPanelOpen = false"
                @view-all="
                    notificationPanelOpen = false;
                    router.push('/account/notifications');
                "
            />
        </div>

        <div
            v-if="catalogOpen || mobileNavOpen"
            class="app-header__backdrop"
            :class="{ 'app-header__backdrop--nav': mobileNavOpen }"
            @click="closeAll"
        />
    </div>
</template>

<style scoped src="./AppHeader.css"></style>
