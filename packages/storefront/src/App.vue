<script setup lang="ts">
import { onMounted } from 'vue';
import { MvToastContainer, MvConnectionBar } from '@mivend/ui-kit';
import { useAuthStore } from './stores/auth';
import { useCartStore } from './stores/cart';

const authStore = useAuthStore();
const cartStore = useCartStore();

onMounted(async () => {
    await authStore.init();
    if (authStore.isLoggedIn) {
        await cartStore.fetchCart();
    } else if (
        // Only auto-relogin on a *confirmed* logged-out state — never on 'unknown', which now
        // also covers "still retrying after a network failure that outlasted the bounded
        // retry". Branching on isLoggedIn alone used to conflate the two, so a slow dev-server
        // restart would silently mint a brand-new session on top of a still-valid one.
        authStore.authStatus === 'unauthenticated' &&
        import.meta.env.DEV &&
        !sessionStorage.getItem('mv_logged_out')
    ) {
        await authStore.login('ivan@autoservice-nord.example', 'Password123!');
        await cartStore.fetchCart();
    }
});

// Hard navigation: logout() may itself hang during an outage, a reload resets all stuck state.
function handleRelogin(): void {
    void authStore.logout();
    window.location.href = '/login';
}
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
