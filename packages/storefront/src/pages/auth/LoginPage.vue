<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '../../stores/auth';

const router = useRouter();
const route = useRoute();
const { t } = useI18n();
const authStore = useAuthStore();

const form = reactive({ email: '', password: '', remember: false });
const loading = ref(false);
const error = ref('');

async function handleSubmit() {
    loading.value = true;
    error.value = '';
    try {
        const ok = await authStore.login(form.email, form.password);
        if (ok) {
            await router.push((route.query.redirect as string) ?? '/');
        } else {
            error.value = t('auth.loginError');
        }
    } catch {
        error.value = t('auth.loginError');
    } finally {
        loading.value = false;
    }
}
</script>

<template>
    <main class="login-page">
        <div class="login-wrap">
            <a class="login-logo" href="/" aria-label="Home">
                <MvLogo name="mivend" size="md" />
            </a>

            <div class="login-card">
                <h1 class="login-card__title">{{ t('auth.signIn') }}</h1>
                <p class="login-card__subtitle">{{ t('auth.signInSubtitle') }}</p>

                <MvNotice v-if="error" variant="error" class="login-card__error">
                    {{ error }}
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
                            :error="!!error"
                        />
                    </MvFormField>

                    <div class="login-form__row">
                        <label class="login-form__remember">
                            <input v-model="form.remember" type="checkbox" />
                            <span>{{ t('auth.rememberMe') }}</span>
                        </label>
                        <a class="login-form__forgot" href="#">{{ t('auth.forgotPassword') }}</a>
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
            </div>

            <nav class="login-footer">
                <a href="/">{{ t('auth.publicCatalog') }}</a>
                <a href="#">{{ t('auth.help') }}</a>
                <a href="#">{{ t('auth.security') }}</a>
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
    color: #667085;
    cursor: pointer;
}

.login-form__remember input {
    accent-color: #00b894;
}

.login-form__forgot {
    color: #008a64;
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
    color: #667085;
}

.login-footer a {
    color: #008a64;
    text-decoration: none;
}

.login-footer a:hover {
    text-decoration: underline;
}
</style>
