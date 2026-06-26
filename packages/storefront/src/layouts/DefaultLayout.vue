<template>
    <el-container class="layout">
        <el-header class="layout__header">
            <span class="layout__logo">mivend</span>
            <el-menu mode="horizontal" :router="true" :default-active="route.path">
                <el-menu-item index="/">{{ t('nav.catalog') }}</el-menu-item>
                <el-menu-item index="/cart">{{ t('nav.cart') }}</el-menu-item>
                <el-menu-item index="/orders">{{ t('nav.orders') }}</el-menu-item>
                <el-menu-item index="/account">{{ t('nav.account') }}</el-menu-item>
            </el-menu>
            <el-button text @click="authStore.logout()">{{ t('auth.logout') }}</el-button>
        </el-header>
        <el-main>
            <RouterView />
        </el-main>
    </el-container>
</template>

<script setup lang="ts">
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '../stores/auth';

const route = useRoute();
const { t } = useI18n();
const authStore = useAuthStore();
</script>

<style scoped>
.layout__header {
    display: flex;
    align-items: center;
    gap: 24px;
    border-bottom: 1px solid var(--el-border-color);
}
.layout__logo {
    font-weight: 600;
    font-size: 18px;
    white-space: nowrap;
}
</style>
