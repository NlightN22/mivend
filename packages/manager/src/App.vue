<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { MvNotificationPopups } from '@mivend/ui-kit';
import { useAuthStore } from './stores/auth';
import { i18n } from './i18n';
import { elementLocale } from './i18n/elementLocale';

const authStore = useAuthStore();
const locale = computed(() => elementLocale(i18n.global.locale.value));

onMounted(async () => {
    await authStore.init();
});
</script>

<template>
    <ElConfigProvider :locale="locale">
        <RouterView />
        <MvNotificationPopups />
    </ElConfigProvider>
</template>
