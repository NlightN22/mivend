<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { readSiteIconUrl, readSiteName } from '@mivend/ui-kit';
import LegalConsentForm from '../../components/LegalConsentForm.vue';

const siteName = readSiteName();
const siteIconUrl = readSiteIconUrl();
const route = useRoute();
const router = useRouter();
const { t } = useI18n();
</script>

<template>
    <main class="login-page">
        <div class="login-wrap">
            <a class="login-logo" href="/" :aria-label="t('nav.home')">
                <MvLogo :name="siteName" :icon-url="siteIconUrl" size="md" />
            </a>
            <div class="login-card">
                <h1 class="login-card__title">{{ t('legal.consent.title') }}</h1>
                <p class="login-card__subtitle">{{ t('legal.consent.subtitle') }}</p>
                <LegalConsentForm
                    @done="router.push((route.query.redirect as string) ?? '/')"
                    @left="router.push('/login')"
                />
            </div>
        </div>
    </main>
</template>

<style scoped>
.login-page {
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: 28px 16px;
    background: var(--el-bg-color-page);
}

.login-wrap {
    width: min(420px, 100%);
    display: flex;
    flex-direction: column;
    align-items: center;
}

.login-logo {
    text-decoration: none;
    color: inherit;
    margin-bottom: 22px;
}

.login-card {
    width: 100%;
    background: var(--app-surface);
    border: 1px solid var(--app-border-glass);
    border-radius: 30px;
    box-shadow: 0 18px 44px var(--app-ink-10);
    padding: 28px 24px;
}

.login-card__title {
    margin: 0 0 6px;
    font-size: 32px;
    font-weight: 900;
    line-height: 1;
    letter-spacing: -0.055em;
    color: var(--app-nav-text-strong);
}

.login-card__subtitle {
    margin: 0 0 20px;
    color: var(--app-slate-fg);
    font-size: 14px;
    line-height: 1.45;
}
</style>
