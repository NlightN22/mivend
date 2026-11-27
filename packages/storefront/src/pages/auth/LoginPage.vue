<script setup lang="ts">
import { reactive, ref, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import {
    MvCaptchaWidget,
    MvCheckbox,
    MvSkeleton,
    MvTwoFactorSignInStep,
    readSiteIconUrl,
    readSiteName,
    useSignInCaptcha,
    useTwoFactorSignIn,
} from '@mivend/ui-kit';
import { fetchCaptchaRequirement } from '../../api/signInCaptcha';
import { createSignInApi } from '../../api/twoFactor';
import { useAuthStore } from '../../stores/auth';
import LegalConsentForm from '../../components/LegalConsentForm.vue';
import { useCartStore } from '../../stores/cart';
import { needsLegalConfirmation } from './signInLegal';
import { useTwoFactorLabels } from './useTwoFactorLabels';

const siteName = readSiteName();
const siteIconUrl = readSiteIconUrl();

const router = useRouter();
const route = useRoute();
const { t } = useI18n();
const authStore = useAuthStore();
const cartStore = useCartStore();
const phase = ref<'form' | 'finishing' | 'confirm'>('form');
const labels = useTwoFactorLabels();

const form = reactive({ email: '', password: '', remember: false });
const signIn = useTwoFactorSignIn(
    createSignInApi({
        plainLogin: (u, p, r) => authStore.login(u, p, r),
        onSession: authStore.completeSignIn,
    }),
);
const { step, error, loading, enrolment, maskedEmail } = signIn;
const recovered = route.query.notice === 'two-factor-recovered';

const captcha = useSignInCaptcha(fetchCaptchaRequirement);

watch(error, value => {
    if (value) void captcha.refresh(form.email);
});

async function finishSignIn(): Promise<void> {
    await router.push(
        authStore.passwordChangeRequired
            ? '/account/settings'
            : ((route.query.redirect as string) ?? '/'),
    );
}

async function completeSignIn(): Promise<void> {
    await cartStore.fetchCart();
    await finishSignIn();
}

function backToForm(): void {
    phase.value = 'form';
    signIn.back();
}

watch(step, async value => {
    if (value !== 'done') return;
    captcha.clear();
    phase.value = 'finishing';
    if (authStore.customer && (await needsLegalConfirmation(authStore.customer.id))) {
        phase.value = 'confirm';
        return;
    }
    await completeSignIn();
});

function confirmed(): Promise<void> {
    phase.value = 'finishing';
    return completeSignIn();
}

function passwordError(): string {
    if (!error.value) return '';
    return error.value === 'INVALID_CREDENTIALS' || error.value === 'UNKNOWN'
        ? t('auth.loginError')
        : labels.value.errors[error.value];
}

function handleSubmit(): Promise<void> {
    return signIn.submitPassword(form.email, form.password, form.remember);
}
</script>

<template>
    <main class="login-page">
        <div class="login-wrap">
            <a class="login-logo" href="/" :aria-label="t('nav.home')">
                <MvLogo :name="siteName" :icon-url="siteIconUrl" size="md" />
            </a>

            <div class="login-card">
                <div
                    v-if="phase === 'finishing'"
                    class="login-progress"
                    aria-busy="true"
                    data-testid="login-progress"
                >
                    <h1 class="login-card__title">{{ t('auth.signingIn') }}</h1>
                    <MvSkeleton height="44px" radius="14px" />
                    <MvSkeleton height="44px" radius="14px" />
                </div>
                <template v-else-if="phase === 'confirm'">
                    <h1 class="login-card__title">{{ t('legal.consent.title') }}</h1>
                    <p class="login-card__subtitle">{{ t('legal.consent.subtitle') }}</p>
                    <LegalConsentForm @done="confirmed" @left="backToForm" />
                </template>
                <MvTwoFactorSignInStep
                    v-else-if="step !== 'password' && step !== 'done'"
                    :step="step"
                    :error="error"
                    :loading="loading"
                    :enrolment="enrolment"
                    :masked-email="maskedEmail"
                    :labels="labels"
                    @code="signIn.submitCode"
                    @recover="signIn.requestRecovery"
                    @back-to-code="signIn.backToCode"
                    @back="signIn.back"
                />
                <template v-else>
                    <h1 class="login-card__title">{{ t('auth.signIn') }}</h1>
                    <p class="login-card__subtitle">{{ t('auth.signInSubtitle') }}</p>

                    <MvNotice v-if="recovered && !error" variant="info" class="login-card__error">
                        {{ t('twoFactor.recovered') }}
                    </MvNotice>
                    <MvNotice v-if="error" variant="error" class="login-card__error">
                        {{ passwordError() }}
                    </MvNotice>

                    <form class="login-form" novalidate @submit.prevent="handleSubmit">
                        <MvFormField :label="t('auth.emailOrPhone')">
                            <MvInput
                                v-model="form.email"
                                type="email"
                                :placeholder="t('auth.emailPlaceholder')"
                                autocomplete="username"
                                :error="!!error"
                            />
                        </MvFormField>

                        <MvFormField :label="t('auth.password')">
                            <MvPasswordInput
                                v-model="form.password"
                                :placeholder="t('auth.passwordPlaceholder')"
                                :show-label="t('auth.showPassword')"
                                :hide-label="t('auth.hidePassword')"
                                :error="!!error"
                            />
                        </MvFormField>

                        <MvCaptchaWidget
                            v-if="captcha.required.value"
                            :key="captcha.widgetKey.value"
                            :site-key="captcha.siteKey.value"
                            :script-url="captcha.scriptUrl.value"
                            :widget-global="captcha.widgetGlobal.value"
                            @token="captcha.onToken"
                        />

                        <div class="login-form__row">
                            <MvCheckbox
                                v-model="form.remember"
                                class="login-form__remember"
                                :label="t('auth.rememberMe')"
                            />
                            <a class="login-form__forgot" href="#">{{
                                t('auth.forgotPassword')
                            }}</a>
                        </div>

                        <MvButton
                            variant="primary"
                            size="lg"
                            :loading="loading"
                            class="login-form__submit"
                            native-type="submit"
                        >
                            {{ t('auth.login') }}
                        </MvButton>
                    </form>
                </template>
            </div>

            <nav class="login-footer">
                <a href="/">{{ t('auth.publicCatalog') }}</a>
                <a href="#">{{ t('auth.help') }}</a>
                <a href="#">{{ t('auth.security') }}</a>
                <a href="/legal/policy" data-testid="login-policy-link">{{ t('legal.policy') }}</a>
            </nav>
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

.login-progress {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 14px;
}

.login-card__error {
    margin-bottom: 16px;
}

.login-form {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 14px;
}

.login-form__row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    font-size: 13px;
}

.login-form__remember {
    font-size: 13px;
    font-weight: 700;
    color: var(--app-slate-fg);
}

.login-form__forgot {
    color: var(--app-nav-accent);
    font-weight: 700;
    text-decoration: none;
}

.login-form__forgot:hover {
    text-decoration: underline;
}

.login-form__submit {
    width: 100%;
    min-height: 56px;
}

.login-footer {
    display: flex;
    justify-content: center;
    gap: 14px;
    flex-wrap: wrap;
    margin-top: 18px;
    font-size: 12px;
    font-weight: 700;
    color: var(--app-slate-fg);
}

.login-footer a {
    color: var(--app-nav-accent);
    text-decoration: none;
}

.login-footer a:hover {
    text-decoration: underline;
}
</style>
