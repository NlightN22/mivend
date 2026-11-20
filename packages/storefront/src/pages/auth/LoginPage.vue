<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import {
    MvCaptchaWidget,
    MvTwoFactorSignInStep,
    readSiteIconUrl,
    readSiteName,
    useSignInCaptcha,
    useTwoFactorSignIn,
} from '@mivend/ui-kit';
import { fetchCaptchaRequirement } from '../../api/signInCaptcha';
import { createSignInApi } from '../../api/twoFactor';
import { useAuthStore } from '../../stores/auth';
import LegalConsentChecks from '../../components/LegalConsentChecks.vue';
import { useCartStore } from '../../stores/cart';
import { useLegalStore } from '../../stores/legal';
import { useLoginConsents } from './useLoginConsents';
import { useTwoFactorLabels } from './useTwoFactorLabels';

const siteName = readSiteName();
const siteIconUrl = readSiteIconUrl();

const router = useRouter();
const route = useRoute();
const { t } = useI18n();
const authStore = useAuthStore();
const cartStore = useCartStore();
const legal = useLegalStore();
const consents = useLoginConsents();
const consentMissing = ref(false);
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

function leaveUnconfirmed(): Promise<void> {
    consentMissing.value = true;
    legal.reset();
    void consents.load();
    return authStore.logout().then(() => signIn.back());
}

watch(step, async value => {
    if (value !== 'done') return;
    captcha.clear();
    if (authStore.customer && !(await consents.settle(authStore.customer.id))) {
        await leaveUnconfirmed();
        return;
    }
    await cartStore.fetchCart();
    await finishSignIn();
});

onMounted(() => void consents.load());

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
                <MvTwoFactorSignInStep
                    v-if="step !== 'password' && step !== 'done'"
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
                                @update:model-value="consents.email.value = String($event)"
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

                        <MvNotice v-if="consentMissing" variant="error">
                            {{ t('legal.login.required') }}
                        </MvNotice>
                        <template v-if="consents.visible.value">
                            <LegalConsentChecks
                                :pending="consents.checks.value"
                                :checked="consents.checked"
                                @toggle="(kind, value) => (consents.checked[kind] = value)"
                            />
                        </template>

                        <MvCaptchaWidget
                            v-if="captcha.required.value"
                            :key="captcha.widgetKey.value"
                            :site-key="captcha.siteKey.value"
                            :script-url="captcha.scriptUrl.value"
                            :widget-global="captcha.widgetGlobal.value"
                            @token="captcha.onToken"
                        />

                        <div class="login-form__row">
                            <label class="login-form__remember">
                                <input v-model="form.remember" type="checkbox" />
                                <span>{{ t('auth.rememberMe') }}</span>
                            </label>
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
                            {{
                                consents.visible.value ? t('legal.login.confirm') : t('auth.login')
                            }}
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
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-weight: 700;
    color: var(--app-slate-fg);
    cursor: pointer;
}

.login-form__remember input {
    accent-color: var(--el-color-primary);
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
