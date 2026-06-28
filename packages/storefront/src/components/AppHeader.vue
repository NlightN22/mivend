<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { useCartStore } from '../stores/cart';
import { useCatalogStore } from '../stores/catalog';

const router = useRouter();
const authStore = useAuthStore();
const cartStore = useCartStore();
const catalogStore = useCatalogStore();
const searchQuery = ref('');
const catalogOpen = ref(false);

const cartTotal = computed(() => {
    if (cartStore.totalPrice === 0) return '0 ₽';
    return new Intl.NumberFormat('ru-RU').format(cartStore.totalPrice) + ' ₽';
});

function onSearch(value: string): void {
    router.push({ path: '/catalog', query: value ? { q: value } : {} });
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

function navigateToCollection(slug: string): void {
    router.push({ path: '/catalog', query: { collection: slug } });
    closeCatalog();
}

function onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') closeCatalog();
}

onMounted(() => document.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown));
</script>

<template>
    <div class="app-header-wrap" :class="{ 'app-header-wrap--open': catalogOpen }">
        <div v-if="authStore.isLoggedIn" class="app-header__strip">
            <div class="app-header__strip-inner">
                <span><strong>B2B Portal</strong> for fast ordering of auto parts and consumables</span>
                <span>Live stock and prices</span>
            </div>
        </div>

        <header class="app-header">
            <div class="app-header__inner">
                <RouterLink to="/" class="app-header__logo-link" aria-label="Home">
                    <MvLogo name="mivend" size="md" />
                </RouterLink>

                <button
                    :class="['app-header__catalog-btn', { 'app-header__catalog-btn--open': catalogOpen }]"
                    type="button"
                    @click="toggleCatalog"
                >
                    <span>{{ catalogOpen ? '✕' : '☰' }}</span> Catalogue
                </button>

                <div class="app-header__search">
                    <MvSearchInput
                        v-model="searchQuery"
                        placeholder="Article, VIN, brand, name or OEM"
                        :suggestions="[]"
                        @search="onSearch"
                    />
                </div>

                <nav class="app-header__nav">
                    <template v-if="authStore.isLoggedIn">
                        <RouterLink to="/account" class="app-header__nav-btn">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <circle cx="12" cy="8" r="4"/>
                                <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
                            </svg>
                            <span>Account</span>
                        </RouterLink>
                        <RouterLink to="/orders" class="app-header__nav-btn">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M3 9l1.5-6h15L21 9"/>
                                <rect x="3" y="9" width="18" height="12" rx="2"/>
                                <path d="M9 13h6M9 17h4"/>
                            </svg>
                            <span>Orders</span>
                        </RouterLink>
                        <RouterLink to="/favorites" class="app-header__nav-btn">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                            </svg>
                            <span>Favourites</span>
                        </RouterLink>
                        <RouterLink to="/cart" class="app-header__cart">
                            <span>&#128722;</span>
                            <span class="app-header__cart-text">
                                <small>Cart</small>
                                {{ cartTotal }}
                            </span>
                            <span class="app-header__cart-badge">{{ cartStore.itemCount }}</span>
                        </RouterLink>
                    </template>

                    <template v-else>
                        <RouterLink to="/login" class="app-header__nav-btn">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <circle cx="12" cy="8" r="4"/>
                                <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
                            </svg>
                            <span>Sign in</span>
                        </RouterLink>
                    </template>
                </nav>
            </div>

            <div v-if="authStore.isLoggedIn" class="app-header__delivery">
                <span class="app-header__delivery-line">
                    <template v-if="authStore.tradingPoint">
                        Trading point &middot;
                        <strong>{{ authStore.tradingPoint.name }}</strong>
                        <span class="app-header__delivery-address">&nbsp;— {{ authStore.tradingPoint.address }}</span>
                    </template>
                    <template v-else>
                        <span class="app-header__delivery-hint">No trading point selected</span>
                    </template>
                </span>
            </div>

            <MvCatalogDropdown
                :collections="catalogStore.collections"
                :open="catalogOpen"
                @close="closeCatalog"
                @navigate="navigateToCollection"
            />
        </header>

        <div v-if="catalogOpen" class="app-header__backdrop" @click="closeCatalog" />
    </div>
</template>

<style scoped>
.app-header-wrap {
    position: sticky;
    top: 0;
    z-index: 50;
}

.app-header__strip {
    background: #14231f;
    color: #d8eee7;
    font-size: 13px;
}

.app-header__strip-inner {
    max-width: 1440px;
    margin: 0 auto;
    padding: 8px 28px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
}

.app-header__strip strong { color: #fff; }

.app-header {
    position: relative;
    background: rgba(255, 255, 255, 0.96);
    border-bottom: 1px solid #dde7e2;
    backdrop-filter: blur(16px);
}

.app-header__inner {
    max-width: 1440px;
    margin: 0 auto;
    padding: 12px 28px 8px;
    display: grid;
    grid-template-columns: 160px 144px minmax(360px, 1fr) auto;
    gap: 12px;
    align-items: center;
}

.app-header__logo-link {
    text-decoration: none;
    color: inherit;
}

.app-header__catalog-btn {
    width: 100%;
    height: 52px;
    border: none;
    border-radius: 14px;
    background: var(--app-accent-lime, #c8f21a);
    color: #14231f;
    font-size: 15px;
    font-weight: 800;
    font-family: inherit;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    white-space: nowrap;
    box-shadow: 0 8px 18px rgba(200, 242, 26, 0.28);
    transition: background 0.15s;
}

.app-header__catalog-btn:hover,
.app-header__catalog-btn--open {
    background: #b8e010;
}

.app-header__search { min-width: 0; }

.app-header__nav {
    display: flex;
    align-items: center;
    gap: 4px;
}

.app-header__nav-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    min-width: 58px;
    padding: 7px 6px 6px;
    border-radius: 12px;
    text-decoration: none;
    color: #66736e;
    cursor: pointer;
    transition: background 0.14s, color 0.14s;
}

.app-header__nav-btn span {
    font-size: 11px;
    font-weight: 800;
    line-height: 1;
    white-space: nowrap;
}

.app-header__nav-btn:hover {
    background: #f4faf7;
    color: #008a64;
}

.app-header__nav-btn.router-link-active {
    background: #e2f8ef;
    color: #008a64;
}

.app-header__nav-link {
    min-height: 48px;
    min-width: 60px;
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    font-size: 11px;
    font-weight: 700;
    color: #7b8984;
    text-decoration: none;
    padding: 0 6px;
}

.app-header__nav-link:hover { background: #f4faf7; color: #008a64; }
.app-header__nav-icon { font-size: 18px; line-height: 1; }

.app-header__cart {
    min-height: 52px;
    min-width: 160px;
    border-radius: 18px;
    background: var(--app-accent-orange, #ff8a00);
    color: #fff;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 10px 0 14px;
    font-weight: 800;
    font-size: 15px;
    text-decoration: none;
    box-shadow: 0 10px 22px rgba(255, 138, 0, 0.22);
}

.app-header__cart-text {
    flex: 1;
    line-height: 1.1;
    white-space: nowrap;
}

.app-header__cart-text small {
    display: block;
    font-size: 11px;
    opacity: 0.9;
}

.app-header__cart-badge {
    min-width: 32px;
    height: 32px;
    border-radius: 999px;
    background: #fff;
    color: var(--app-accent-orange, #ff8a00);
    display: grid;
    place-items: center;
    font-weight: 900;
    font-size: 14px;
    flex-shrink: 0;
}

.app-header__delivery {
    max-width: 1440px;
    margin: 0 auto;
    padding: 0 28px 8px;
    display: flex;
    justify-content: flex-end;
}

.app-header__delivery-line {
    font-size: 13px;
    color: #66736e;
}

.app-header__delivery-line strong {
    color: #008a64;
    font-weight: 900;
}

.app-header__delivery-address { color: #a8b8b2; }
.app-header__delivery-hint { color: #a8b8b2; font-style: italic; }

.app-header__backdrop {
    position: fixed;
    inset: 0;
    background: rgba(20, 35, 31, 0.06);
    z-index: -1;
}
</style>
