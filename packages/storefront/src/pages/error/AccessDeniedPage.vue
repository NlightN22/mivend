<script setup lang="ts">
import { useDemoMode } from '../../composables/useDemoMode';
import { useAuthStore } from '../../stores/auth';

const authStore = useAuthStore();
const { demoAllowed } = useDemoMode();
</script>

<template>
    <div class="ad-page">
        <div class="ad-card">
            <div class="ad-code">{{ $t('errorPages.deniedCode') }}</div>
            <h1 class="ad-title">{{ $t('errorPages.deniedTitle') }}</h1>
            <p class="ad-sub">
                {{ $t('errorPages.deniedText') }}
            </p>

            <div class="ad-actions">
                <RouterLink to="/catalog" class="ad-btn ad-btn--primary">{{
                    $t('errorPages.backToCatalog')
                }}</RouterLink>
                <RouterLink v-if="authStore.isLoggedIn" to="/account" class="ad-btn">{{
                    $t('errorPages.myAccount')
                }}</RouterLink>
                <RouterLink v-else to="/login" class="ad-btn">{{
                    $t('errorPages.otherAccount')
                }}</RouterLink>
                <a href="mailto:support@example.com" class="ad-btn">{{
                    $t('errorPages.requestAccess')
                }}</a>
            </div>

            <div v-if="demoAllowed" class="ad-links">
                <a href="#">{{ $t('common.help') }}</a> &middot;
                <a href="#">{{ $t('common.support') }}</a>
            </div>
        </div>
    </div>
</template>

<style scoped>
.ad-page {
    min-height: 70vh;
    display: grid;
    place-items: center;
    padding: 40px 24px;
}

.ad-card {
    max-width: 520px;
    width: 100%;
    text-align: center;
}

.ad-code {
    display: inline-block;
    font-size: 13px;
    font-weight: 900;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--app-danger-fg);
    background: var(--app-danger2-bg);
    border: 1px solid var(--el-border-color);
    border-radius: 999px;
    padding: 4px 14px;
    margin-bottom: 20px;
}

.ad-title {
    margin: 0 0 12px;
    font-size: clamp(32px, 4vw, 52px);
    line-height: 1;
    letter-spacing: -0.05em;
    color: var(--app-nav-text-strong);
}

.ad-sub {
    margin: 0 0 28px;
    color: var(--app-nav-label);
    font-size: 15px;
    line-height: 1.5;
}

.ad-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 10px;
    margin-bottom: 20px;
}

.ad-btn {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    padding: 0 18px;
    border-radius: 14px;
    border: 1px solid var(--app-nav-border-strong);
    background: var(--app-fill-soft);
    color: var(--app-text-deep);
    font: inherit;
    font-size: 14px;
    font-weight: 800;
    text-decoration: none;
    transition: 0.14s;
}
.ad-btn:hover {
    background: var(--app-nav-border);
}
.ad-btn--primary {
    background: var(--app-brand-fill);
    border-color: transparent;
    color: var(--app-on-accent);
}
.ad-btn--primary:hover {
    background: var(--app-brand-fill-hover);
}

.ad-links {
    font-size: 13px;
    color: var(--app-nav-label);
}
.ad-links a {
    color: var(--app-nav-accent);
    font-weight: 700;
    text-decoration: none;
}
</style>
