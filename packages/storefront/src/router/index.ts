import { createRouter, createWebHistory } from 'vue-router';

export const router = createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),
    routes: [
        {
            path: '/',
            component: () => import('../pages/CatalogPage.vue'),
        },
        {
            path: '/product/:slug',
            component: () => import('../pages/ProductPage.vue'),
        },
        {
            path: '/cart',
            component: () => import('../pages/CartPage.vue'),
        },
        {
            path: '/orders',
            meta: { requiresAuth: true },
            component: () => import('../pages/OrdersPage.vue'),
        },
        {
            path: '/login',
            component: () => import('../pages/LoginPage.vue'),
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

import { useAuthStore } from '../stores/auth';
