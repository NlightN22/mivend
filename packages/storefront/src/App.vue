<script setup lang="ts">
import { onMounted } from 'vue';
import { MvToastContainer, MvNotice } from '@mivend/ui-kit';
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
</script>

<template>
    <RouterView />
    <MvNotice v-if="authStore.isReconnecting" variant="warning" class="app__reconnecting">
        Reconnecting to the server… your session is still active.
    </MvNotice>
    <MvToastContainer />
</template>

<style scoped>
.app__reconnecting {
    position: fixed;
    bottom: 16px;
    right: 16px;
    max-width: 320px;
    z-index: 2000;
}
</style>
