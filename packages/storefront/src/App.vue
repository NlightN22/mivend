<script setup lang="ts">
import { onMounted } from 'vue';
import { useAuthStore } from './stores/auth';
import { useCartStore } from './stores/cart';

const authStore = useAuthStore();
const cartStore = useCartStore();

onMounted(async () => {
    await authStore.fetchCurrentCustomer();
    if (authStore.isLoggedIn) await cartStore.fetchCart();
    if (import.meta.env.DEV && !authStore.isLoggedIn) {
        await authStore.login('ivan@autoservice-nord.example', 'Password123!');
        await cartStore.fetchCart();
    }
});
</script>

<template>
    <RouterView />
</template>
