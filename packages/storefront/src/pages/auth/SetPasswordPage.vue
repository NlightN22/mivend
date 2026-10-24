<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { MIN_PASSWORD_LENGTH } from './passwordReset';
import { useSetPassword, type TokenFlow } from './useSetPassword';

const props = defineProps<{ flow: TokenFlow }>();
const { t } = useI18n();
const { form, state, error, loading, tooShort, mismatch, submittable, submit, remaining } =
    useSetPassword(props.flow);
const copy = computed(() => (props.flow === 'verify' ? 'auth.verifyAccount' : 'auth.setPassword'));
</script>

<template>
    <main class="login-page">
        <div class="login-wrap">
            <a class="login-logo" href="/" :aria-label="t('nav.home')">
                <MvLogo name="mivend" size="md" />
            </a>

            <div class="login-card">
                <template v-if="state === 'form'">
                    <h1 class="login-card__title">{{ t(`${copy}.title`) }}</h1>
                    <p class="login-card__subtitle">{{ t(`${copy}.subtitle`) }}</p>

                    <MvNotice v-if="error" variant="error" class="login-card__error">
                        {{ error }}
                    </MvNotice>

                    <form class="login-form" novalidate @submit.prevent="submit">
                        <MvFormField :label="t('auth.setPassword.newPassword')">
                            <MvPasswordInput
                                v-model="form.password"
                                autocomplete="new-password"
                                :show-label="t('auth.showPassword')"
                                :hide-label="t('auth.hidePassword')"
                                :error="tooShort"
                            />
                        </MvFormField>
                        <MvNotice v-if="tooShort" variant="error">
                            {{ t('auth.setPassword.tooShort') }}
                        </MvNotice>

                        <MvFormField :label="t('auth.setPassword.confirmPassword')">
                            <MvPasswordInput
                                v-model="form.confirm"
                                autocomplete="new-password"
                                :show-label="t('auth.showPassword')"
                                :hide-label="t('auth.hidePassword')"
                                :error="mismatch"
                            />
                        </MvFormField>
                        <MvNotice v-if="mismatch" variant="error">
                            {{ t('auth.setPassword.mismatch') }}
                        </MvNotice>

                        <p class="login-card__subtitle">
                            {{ t('auth.setPassword.rules', { min: MIN_PASSWORD_LENGTH }) }}
                        </p>

                        <MvButton
                            variant="primary"
                            size="lg"
                            :loading="loading"
                            :disabled="!submittable"
                            class="login-form__submit"
                            native-type="submit"
                        >
                            {{ t('auth.setPassword.submit') }}
                        </MvButton>
                    </form>
                </template>

                <template v-else-if="state === 'success'">
                    <h1 class="login-card__title">{{ t('auth.setPassword.successTitle') }}</h1>
                    <p class="login-card__subtitle">{{ t(`${copy}.successText`) }}</p>
                    <p class="login-card__subtitle" role="status">
                        {{ t('auth.setPassword.redirecting', { n: remaining }) }}
                    </p>
                    <MvButton
                        variant="primary"
                        size="lg"
                        href="/catalog"
                        class="login-form__submit"
                    >
                        {{ t('auth.setPassword.toCatalog') }}
                    </MvButton>
                </template>

                <template v-else>
                    <h1 class="login-card__title">{{ t('auth.setPassword.invalidTitle') }}</h1>
                    <p class="login-card__subtitle">{{ t(`${copy}.invalidText`) }}</p>
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
    background: var(--app-color-page, #f6f8fb);
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
    background: #fff;
    border: 1px solid rgba(221, 231, 226, 0.9);
    border-radius: 30px;
    box-shadow: 0 18px 44px rgba(27, 45, 38, 0.1);
    padding: 28px 24px;
}

.login-card__title {
    margin: 0 0 6px;
    font-size: 32px;
    font-weight: 900;
    line-height: 1;
    letter-spacing: -0.055em;
    color: #17212b;
}

.login-card__subtitle {
    margin: 0 0 20px;
    color: #667085;
    font-size: 14px;
    line-height: 1.45;
}

.login-card__error {
    margin-bottom: 16px;
}

.login-form {
    display: grid;
    gap: 14px;
}

.login-form__submit {
    width: 100%;
    min-height: 56px;
}
</style>
