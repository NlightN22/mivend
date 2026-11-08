<script setup lang="ts">
import MvLogo from '../MvLogo/MvLogo.vue';
import { readSiteIconUrl, readSiteName } from '../../utils/siteName';

const siteName = readSiteName();
const siteIconUrl = readSiteIconUrl();
</script>

<template>
    <main class="mv-auth-shell">
        <div class="mv-auth-shell__wrap">
            <MvLogo :name="siteName" :icon-url="siteIconUrl" size="md" />
            <div class="mv-auth-shell__card"><slot /></div>
        </div>
    </main>
</template>

<style scoped>
.mv-auth-shell {
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: 28px 16px;
    background: var(--el-bg-color-page);
}
.mv-auth-shell__wrap {
    width: min(420px, 100%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 22px;
}
.mv-auth-shell__card {
    width: 100%;
    box-sizing: border-box;
    background: var(--app-surface);
    border: 1px solid var(--app-border-glass);
    border-radius: 30px;
    box-shadow: 0 18px 44px var(--app-ink-10);
    padding: 28px 24px;
}
</style>
