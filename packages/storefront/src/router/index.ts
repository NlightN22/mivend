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
                    path: 'orders',
                    component: () => import('../pages/orders/OrdersPage.vue'),
                    meta: { requiresAuth: true },
                },
                {
                    path: 'account',
                    component: () => import('../pages/account/AccountPage.vue'),
                    meta: { requiresAuth: true },
                },
            ],
        },
    ],
});

router.beforeEach((to, _from, next) => {
    const authStore = useAuthStore();
    if (to.meta.requiresAuth && !authStore.isLoggedIn) {
        next({ path: '/login', query: { redirect: to.fullPath } });
    } else {
        next();
    }
});
