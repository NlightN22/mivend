import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth';

export const router = createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),
    routes: [
        {
            path: '/login',
            component: () => import('../pages/auth/LoginPage.vue'),
            meta: { layout: 'auth' },
        },
        {
            path: '/',
            component: () => import('../layouts/DefaultLayout.vue'),
            children: [
                {
                    path: '',
                    component: () => import('../pages/home/HomePage.vue'),
                },
                {
                    path: 'catalog',
                    component: () => import('../pages/catalog/CatalogPage.vue'),
                },
                {
                    path: 'product/:slug',
                    component: () => import('../pages/catalog/ProductPage.vue'),
                },
                {
                    path: 'cart',
                    component: () => import('../pages/cart/CartPage.vue'),
                    meta: { requiresAuth: true },
                },
                {
                    path: 'checkout',
                    component: () => import('../pages/checkout/CheckoutPage.vue'),
                    meta: { requiresAuth: true },
                },
                {
                    path: 'orders',
                    component: () => import('../pages/orders/OrdersPage.vue'),
                    meta: { requiresAuth: true },
                },
                {
                    path: 'account',
                    component: () => import('../pages/account/AccountPage.vue'),
                    meta: { requiresAuth: true },
                },
                {
                    path: 'account/trading-points',
                    component: () => import('../pages/account/TradingPointsPage.vue'),
                    meta: { requiresAuth: true },
                },
                {
                    path: 'documents',
                    component: () => import('../pages/documents/DocumentsPage.vue'),
                    meta: { requiresAuth: true },
                },
                {
                    path: 'favorites',
                    component: () => import('../pages/favorites/FavoritesPage.vue'),
                    meta: { requiresAuth: true },
                },
                {
                    path: 'requests',
                    component: () => import('../pages/requests/RequestsPage.vue'),
                    meta: { requiresAuth: true },
                },
            ],
        },
    ],
});

router.beforeEach(async (to, _from, next) => {
    const authStore = useAuthStore();
    await authStore.init();
    if (to.meta.requiresAuth && !authStore.isLoggedIn) {
        next({ path: '/login', query: { redirect: to.fullPath } });
    } else {
        next();
    }
});
