<script setup lang="ts">
import { useAuthStore } from '../../stores/auth';

const authStore = useAuthStore();
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

            <div class="ad-links">
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
    color: #b42318;
    background: #fff2f1;
    border: 1px solid #fdd;
    border-radius: 999px;
    padding: 4px 14px;
    margin-bottom: 20px;
}

.ad-title {
    margin: 0 0 12px;
    font-size: clamp(32px, 4vw, 52px);
    line-height: 1;
    letter-spacing: -0.05em;
    color: #14231f;
}

.ad-sub {
    margin: 0 0 28px;
    color: #66736e;
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
    border: 1px solid #dde7e2;
    background: #f3f8f6;
    color: #263732;
    font: inherit;
    font-size: 14px;
    font-weight: 800;
    text-decoration: none;
    transition: 0.14s;
}
.ad-btn:hover {
    background: #e8f2ed;
}
.ad-btn--primary {
    background: #00a878;
    border-color: transparent;
    color: #fff;
}
.ad-btn--primary:hover {
    background: #008a64;
}

.ad-links {
    font-size: 13px;
    color: #66736e;
}
.ad-links a {
    color: #008a64;
    font-weight: 700;
    text-decoration: none;
}
</style>
