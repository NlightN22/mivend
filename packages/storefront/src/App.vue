<script setup lang="ts">
import { onMounted } from 'vue';
import { useAuthStore } from './stores/auth';
import { useCartStore } from './stores/cart';

const authStore = useAuthStore();
const cartStore = useCartStore();

onMounted(async () => {
    await authStore.init();
    if (authStore.isLoggedIn) {
        await cartStore.fetchCart();
    } else if (import.meta.env.DEV) {
        await authStore.login('ivan@autoservice-nord.example', 'Password123!');
        await cartStore.fetchCart();
    }
});
</script>

<template>
    <RouterView />
</template>
