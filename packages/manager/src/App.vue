<script setup lang="ts">
import { onMounted } from 'vue';
import { MvToastContainer } from '@mivend/ui-kit';
import { useAuthStore } from './stores/auth';

const authStore = useAuthStore();

onMounted(async () => {
    await authStore.init();
});
</script>

<template>
    <RouterView />
    <MvToastContainer />
</template>
