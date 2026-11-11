<script setup lang="ts">
import { onMounted } from 'vue';
import { MvNotificationPopups } from '@mivend/ui-kit';
import { useAuthStore } from './stores/auth';

const authStore = useAuthStore();

onMounted(async () => {
    await authStore.init();
});
</script>

<template>
    <RouterView />
    <MvNotificationPopups />
</template>
