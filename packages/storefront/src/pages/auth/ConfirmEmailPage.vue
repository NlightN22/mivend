<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { readSiteIconUrl, readSiteName } from '@mivend/ui-kit';
import { useConfirmEmail } from './useConfirmEmail';

const siteName = readSiteName();
const siteIconUrl = readSiteIconUrl();
const { t } = useI18n();
const { state } = useConfirmEmail();
</script>

<template>
    <main class="login-page">
        <div class="login-wrap">
            <a class="login-logo" href="/" :aria-label="t('nav.home')">
                <MvLogo :name="siteName" :icon-url="siteIconUrl" size="md" />
            </a>

            <div class="login-card">
                <template v-if="state === 'loading'">
                    <h1 class="login-card__title">{{ t('auth.confirmEmail.loadingTitle') }}</h1>
                    <p class="login-card__subtitle" role="status">
                        {{ t('auth.confirmEmail.loadingText') }}
                    </p>
                </template>

                <template v-else-if="state === 'success'">
                    <h1 class="login-card__title">{{ t('auth.confirmEmail.successTitle') }}</h1>
                    <p class="login-card__subtitle">{{ t('auth.confirmEmail.successText') }}</p>
                    <MvButton variant="primary" size="lg" href="/" class="login-form__submit">
                        {{ t('auth.setPassword.toCatalog') }}
                    </MvButton>
                </template>

                <template v-else>
                    <h1 class="login-card__title">{{ t('auth.confirmEmail.invalidTitle') }}</h1>
                    <p class="login-card__subtitle">{{ t('auth.confirmEmail.invalidText') }}</p>
                    <MvButton
                        variant="secondary"
                        size="lg"
                        href="/login"
                        class="login-form__submit"
                    >
                        {{ t('auth.setPassword.toLogin') }}
                    </MvButton>
                </template>
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

.login-card__error {
    margin-bottom: 16px;
}

.login-form {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 14px;
}

.login-form__submit {
    width: 100%;
    min-height: 56px;
}
</style>
