<script setup lang="ts">
import { formatMoney } from '../i18n/format';
import { ref, shallowRef, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { IconCategory, IconClipboardList, IconDots, IconHeart, IconUser } from '@tabler/icons-vue';
import {
    MvAccountDropdown,
    MvAccountMenu,
    MvAccountSheet,
    MvBottomTabBar,
    MvNotificationBell,
    MvNotificationPanel,
    readSiteIconUrl,
    readSiteName,
    type BottomTabItem,
} from '@mivend/ui-kit';
import { useLanguageSwitcher } from '../composables/useLanguageSwitcher';
import { headerDeliveryLabel } from '../composables/headerDeliveryLabel';
import { activeBottomTab } from '../composables/bottomTabActive';
import { useAccountMenu } from '../composables/useAccountMenu';
import { useLogout } from '../composables/useLogout';
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
const siteName = readSiteName();
const siteIconUrl = readSiteIconUrl();
const authStore = useAuthStore();
const deliveryLabel = computed(() =>
    headerDeliveryLabel(authStore.counterparty?.fullName, authStore.tradingPoint),
);
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
const accountOpen = ref(false);
const moreOpen = ref(false);
const logout = useLogout();
const desktopMenu = useAccountMenu(['orders', 'favorites']);
const sheetMenu = useAccountMenu(['orders', 'favorites', 'home']);

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

function closeAll(): void {
    closeCatalog();
    accountOpen.value = false;
    moreOpen.value = false;
}

function onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') closeCatalog();
}

const activeTab = computed(() =>
    activeBottomTab(route.path, { moreOpen: moreOpen.value, catalogOpen: catalogOpen.value }),
);
const tabs = computed<BottomTabItem[]>(() => [
    {
        key: 'catalog',
        label: t('nav.catalog'),
        icon: IconCategory,
        active: activeTab.value === 'catalog',
    },
    {
        key: 'orders',
        label: t('nav.orders'),
        icon: IconClipboardList,
        to: '/orders',
        active: activeTab.value === 'orders',
    },
    {
        key: 'favorites',
        label: t('nav.favourites'),
        icon: IconHeart,
        to: '/favorites',
        active: activeTab.value === 'favorites',
        badgeCount: favoritesStore.count,
    },
    {
        key: 'cabinet',
        label: t('nav.account'),
        icon: IconUser,
        to: '/account',
        active: activeTab.value === 'cabinet',
    },
    { key: 'more', label: t('nav.more'), icon: IconDots, active: activeTab.value === 'more' },
]);

function onTabSelect(key: string): void {
    if (key === 'catalog') {
        moreOpen.value = false;
        toggleCatalog();
    } else if (key === 'more') {
        closeCatalog();
        moreOpen.value = !moreOpen.value;
    }
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
    <div class="app-header-wrap">
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
                    <MvLogo :name="siteName" :icon-url="siteIconUrl" size="md" />
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

                <div v-if="authStore.isLoggedIn" class="app-header__account-nav">
                    <MvAccountDropdown v-model:open="accountOpen" :label="t('nav.account')">
                        <MvAccountMenu
                            :user-name="desktopMenu.userName.value"
                            :user-role="desktopMenu.userRole.value"
                            :user-initials="desktopMenu.userInitials.value"
                            :entries="desktopMenu.entries.value"
                            :active-path="route.path"
                            :languages="language.options"
                            :locale="language.locale.value"
                            :language-label="t('nav.interfaceLanguage')"
                            :logout-label="t('account.logout')"
                            @navigate="accountOpen = false"
                            @select-language="language.select"
                            @logout="logout"
                        />
                    </MvAccountDropdown>
                    <RouterLink to="/orders" class="app-header__nav-btn">
                        <IconClipboardList :size="20" aria-hidden="true" />
                        <span>{{ t('nav.orders') }}</span>
                    </RouterLink>
                    <RouterLink to="/favorites" class="app-header__nav-btn">
                        <span class="app-header__nav-icon-wrap">
                            <IconHeart :size="20" aria-hidden="true" />
                            <span v-if="favoritesStore.count > 0" class="app-header__fav-badge">{{
                                favoritesStore.count
                            }}</span>
                        </span>
                        <span>{{ t('nav.favourites') }}</span>
                    </RouterLink>
                </div>
                <RouterLink v-else to="/login" class="app-header__nav-btn app-header__signin">
                    <IconUser :size="20" aria-hidden="true" />
                    <span>{{ t('nav.signIn') }}</span>
                </RouterLink>

                <MvNotificationBell
                    v-if="notificationsStore"
                    class="app-header__bell"
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
            </div>

            <div v-if="authStore.isLoggedIn" class="app-header__delivery">
                <span class="app-header__delivery-line">
                    <template v-if="deliveryLabel.organization || deliveryLabel.place">
                        <template v-if="deliveryLabel.organization">{{
                            deliveryLabel.organization
                        }}</template>
                        <template v-if="deliveryLabel.organization && deliveryLabel.place">
                            &middot;
                        </template>
                        <strong v-if="deliveryLabel.place">{{ deliveryLabel.place }}</strong>
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

        <div v-if="catalogOpen" class="app-header__backdrop" @click="closeAll" />

        <template v-if="authStore.isLoggedIn">
            <MvBottomTabBar :items="tabs" :aria-label="t('nav.tabs')" @select="onTabSelect" />
            <MvAccountSheet :open="moreOpen" :close-label="t('nav.more')" @close="moreOpen = false">
                <MvAccountMenu
                    :user-name="sheetMenu.userName.value"
                    :user-role="sheetMenu.userRole.value"
                    :user-initials="sheetMenu.userInitials.value"
                    :entries="sheetMenu.entries.value"
                    :active-path="route.path"
                    :languages="language.options"
                    :locale="language.locale.value"
                    :language-label="t('nav.interfaceLanguage')"
                    :logout-label="t('account.logout')"
                    @navigate="moreOpen = false"
                    @select-language="language.select"
                    @logout="logout"
                />
            </MvAccountSheet>
        </template>
    </div>
</template>

<style scoped src="./AppHeader.css"></style>
