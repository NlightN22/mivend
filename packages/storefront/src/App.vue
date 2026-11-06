<script setup lang="ts">
import { onMounted } from 'vue';
import { MvToastContainer, MvConnectionBar } from '@mivend/ui-kit';
import { useAuthStore } from './stores/auth';
import { useActingStore } from './stores/acting';
import { useCartStore } from './stores/cart';
import { useLogout } from './composables/useLogout';

const authStore = useAuthStore();
const cartStore = useCartStore();
const actingStore = useActingStore();

onMounted(async () => {
    await Promise.all([authStore.init(), cartStore.fetchCart()]);
    if (
        !authStore.isLoggedIn &&
        // Only auto-relogin on a *confirmed* logged-out state — never on 'unknown', which now
        // also covers "still retrying after a network failure that outlasted the bounded
        // retry". Branching on isLoggedIn alone used to conflate the two, so a slow dev-server
        // restart would silently mint a brand-new session on top of a still-valid one.
        authStore.authStatus === 'unauthenticated' &&
        import.meta.env.DEV &&
        !actingStore.isActing &&
        !sessionStorage.getItem('mv_logged_out')
    ) {
        await authStore.login('ivan@autoservice-nord.example', 'Password123!');
        await cartStore.fetchCart();
    }
});

const handleRelogin = useLogout();
</script>

<template>
    <RouterView />
    <MvConnectionBar
        v-if="authStore.isReconnecting"
        :since="authStore.reconnectingSince"
        @relogin="handleRelogin"
    />
    <MvConnectionBar
        v-else-if="
            authStore.authStatus === 'unauthenticated' &&
            authStore.initialized &&
            $route.meta.requiresAuth
        "
        :since="null"
        logged-out
        @relogin="handleRelogin"
    />
    <MvToastContainer />
</template>
