<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { MvNotice, readSiteIconUrl, readSiteName } from '@mivend/ui-kit';
import LegalConsentChecks from '../../components/LegalConsentChecks.vue';
import { useAuthStore } from '../../stores/auth';
import { useLegalStore } from '../../stores/legal';

const siteName = readSiteName();
const siteIconUrl = readSiteIconUrl();
const route = useRoute();
const router = useRouter();
const { t, locale } = useI18n();
const authStore = useAuthStore();
const legal = useLegalStore();

const pending = computed(() => legal.pending);
const checked = reactive<Record<string, boolean>>({});
const loading = ref(false);
const failed = ref(false);

const ready = computed(() => pending.value.filter(s => s.required).every(s => checked[s.kind]));

async function submit(): Promise<void> {
    loading.value = true;
    failed.value = false;
    try {
        await legal.accept(
            pending.value.map(s => ({
                kind: s.kind,
                version: s.version,
                accepted: !!checked[s.kind],
            })),
            locale.value,
        );
        await router.push((route.query.redirect as string) ?? '/');
    } catch {
        failed.value = true;
    } finally {
        loading.value = false;
    }
}

async function leave(): Promise<void> {
    await authStore.logout();
    legal.reset();
    await router.push('/login');
}
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
                <MvNotice v-if="failed" variant="error" class="login-card__error">
                    {{ t('legal.consent.failed') }}
                </MvNotice>
                <form class="login-form" novalidate @submit.prevent="submit">
                    <LegalConsentChecks
                        :pending="pending"
                        :checked="checked"
                        @toggle="(kind, value) => (checked[kind] = value)"
                    />
                    <MvButton
                        variant="primary"
                        size="lg"
                        :loading="loading"
                        :disabled="!ready"
                        class="login-form__submit"
                        native-type="submit"
                        data-testid="legal-consent-submit"
                    >
                        {{ t('legal.consent.continue') }}
                    </MvButton>
                </form>
                <button type="button" class="login-leave" @click="leave">
                    {{ t('legal.consent.leave') }}
                </button>
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
    gap: 18px;
}

.login-form__submit {
    width: 100%;
    min-height: 56px;
}

.login-leave {
    display: block;
    margin: 14px auto 0;
    background: none;
    border: 0;
    color: var(--app-nav-accent);
    font-weight: 700;
    cursor: pointer;
}
</style>
