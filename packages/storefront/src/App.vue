<script setup lang="ts">
import { onMounted } from 'vue';
import { useAuthStore } from './stores/auth';

const authStore = useAuthStore();
onMounted(async () => {
    await authStore.fetchCurrentCustomer();
    if (import.meta.env.DEV && !authStore.isLoggedIn) {
        await authStore.login('ivan@autoservice-nord.example', 'Password123!');
    }
});
</script>

<template>
    <RouterView />
</template>
