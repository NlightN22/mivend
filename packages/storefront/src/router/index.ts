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
                    path: 'orders/:id',
                    component: () => import('../pages/orders/OrderDetailPage.vue'),
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
                    path: 'account/balance',
                    component: () => import('../pages/account/BalancePage.vue'),
                    meta: { requiresAuth: true },
                },
                {
                    path: 'account/employees',
                    component: () => import('../pages/account/EmployeesPage.vue'),
                    meta: { requiresAuth: true },
                },
                {
                    path: 'account/settings',
                    component: () => import('../pages/account/SettingsPage.vue'),
                    meta: { requiresAuth: true },
                },
                {
                    path: 'payment-stub',
                    component: () => import('../pages/checkout/PaymentStubPage.vue'),
                },
                {
                    path: 'order-created',
                    component: () => import('../pages/checkout/OrderCreatedPage.vue'),
                    meta: { requiresAuth: true },
                },
                {
                    path: 'payment-result',
                    component: () => import('../pages/checkout/PaymentResultPage.vue'),
                    meta: { requiresAuth: true },
                },
                {
                    path: 'documents',
                    component: () => import('../pages/documents/DocumentsPage.vue'),
                    meta: { requiresAuth: true },
                },
                {
                    path: 'invoices',
                    component: () => import('../pages/invoices/InvoicesPage.vue'),
                    meta: { requiresAuth: true },
                },
                {
                    path: 'invoices/:id',
                    component: () => import('../pages/invoices/InvoiceDetailPage.vue'),
                    meta: { requiresAuth: true },
                },
                {
                    path: 'invoices/:id/pay',
                    component: () => import('../pages/invoices/InvoicePayPage.vue'),
                    meta: { requiresAuth: true },
                },
                {
                    path: 'payments',
                    component: () => import('../pages/payments/PaymentsPage.vue'),
                    meta: { requiresAuth: true },
                },
                {
                    path: 'payments/:id',
                    component: () => import('../pages/payments/PaymentDetailPage.vue'),
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
                {
                    path: 'access-denied',
                    component: () => import('../pages/error/AccessDeniedPage.vue'),
                },
                {
                    path: ':pathMatch(.*)*',
                    component: () => import('../pages/error/NotFoundPage.vue'),
                },
            ],
        },
    ],
});

router.beforeEach(async (to, _from, next) => {
    const authStore = useAuthStore();
    await authStore.init();
    // Only a *confirmed* 'unauthenticated' redirects to /login — 'unknown' (still checking, or
    // retrying after a network blip that outlasted the bounded retry) lets navigation proceed,
    // so a prolonged server outage never bounces a still-valid session to the login screen.
    if (to.meta.requiresAuth && authStore.authStatus === 'unauthenticated') {
        next({ path: '/login', query: { redirect: to.fullPath } });
    } else {
        next();
    }
});
