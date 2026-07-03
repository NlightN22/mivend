<script setup lang="ts">
import { onMounted } from 'vue';
import { MvToastContainer } from '@mivend/ui-kit';
import { useAuthStore } from './stores/auth';
import { useCartStore } from './stores/cart';

const authStore = useAuthStore();
const cartStore = useCartStore();

onMounted(async () => {
    await authStore.init();
    if (authStore.isLoggedIn) {
        await cartStore.fetchCart();
    } else if (import.meta.env.DEV && !sessionStorage.getItem('mv_logged_out')) {
        await authStore.login('ivan@autoservice-nord.example', 'Password123!');
        await cartStore.fetchCart();
    }
});
</script>

<template>
    <RouterView />
    <MvToastContainer />
</template>
