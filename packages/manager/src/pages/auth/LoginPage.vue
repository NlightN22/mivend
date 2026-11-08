<script setup lang="ts">
import { reactive, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import {
    readSiteIconUrl,
    readSiteName,
    MvLogo,
    MvFormField,
    MvInput,
    MvPasswordInput,
    MvButton,
    MvNotice,
    MvTwoFactorSignInStep,
    useTwoFactorSignIn,
} from '@mivend/ui-kit';
import { createSignInApi } from '../../api/twoFactor';
import { useAuthStore } from '../../stores/auth';
import { RECOVERED_NOTICE, TWO_FACTOR_LABELS as labels } from './twoFactorLabels';

const siteName = readSiteName();
const siteIconUrl = readSiteIconUrl();

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();

const form = reactive({ username: '', password: '', remember: false });
const signIn = useTwoFactorSignIn(
    createSignInApi({
        plainLogin: (u, p, r) => authStore.login(u, p, r),
        onSession: authStore.completeSignIn,
    }),
);
const { step, error, loading, enrolment, username } = signIn;
const recovered = route.query.notice === 'two-factor-recovered';

watch(step, async value => {
    if (value === 'done') await router.push((route.query.redirect as string) ?? '/');
});

function handleSubmit(): Promise<void> {
    return signIn.submitPassword(form.username, form.password, form.remember);
}
</script>

<template>
    <main class="login-page">
        <div class="login-wrap">
            <MvLogo :name="siteName" :icon-url="siteIconUrl" size="md" />

            <div class="login-card">
                <MvTwoFactorSignInStep
                    v-if="step !== 'password' && step !== 'done'"
                    :step="step"
                    :error="error"
                    :loading="loading"
                    :enrolment="enrolment"
                    :username="username"
                    :labels="labels"
                    @code="signIn.submitCode"
                    @recover="signIn.openRecovery"
                    @send-recovery="signIn.submitRecovery"
                    @back="signIn.back"
                />
                <template v-else>
                    <h1 class="login-card__title">Manager portal sign in</h1>

                    <MvNotice v-if="recovered && !error" variant="info" class="login-card__error">
                        {{ RECOVERED_NOTICE }}
                    </MvNotice>
                    <MvNotice v-if="error" variant="error" class="login-card__error">
                        {{ labels.errors[error === 'UNKNOWN' ? 'INVALID_CREDENTIALS' : error] }}
                    </MvNotice>

                    <form class="login-form" novalidate @submit.prevent="handleSubmit">
                        <MvFormField label="Username">
                            <MvInput
                                v-model="form.username"
                                type="text"
                                autocomplete="username"
                                :error="!!error"
                            />
                        </MvFormField>

                        <MvFormField label="Password">
                            <MvPasswordInput
                                v-model="form.password"
                                autocomplete="current-password"
                                :error="!!error"
                            />
                        </MvFormField>

                        <label class="login-form__remember">
                            <input v-model="form.remember" type="checkbox" />
                            <span>Remember me</span>
                        </label>

                        <MvButton
                            variant="primary"
                            size="lg"
                            native-type="submit"
                            :loading="loading"
                            class="login-form__submit"
                        >
                            Sign in
                        </MvButton>
                    </form>
                </template>
            </div>
        </div>
    </main>
</template>

<style scoped>
.login-page {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    background: #f3f4f6;
}

.login-wrap {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 24px;
}

.login-card {
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 32px;
    width: 340px;
}

.login-card__title {
    font-size: 18px;
    margin: 0 0 20px;
}

.login-card__error {
    margin-bottom: 16px;
}

.login-form {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.login-form__remember {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    font-weight: 600;
    color: #4b5563;
    cursor: pointer;
}

.login-form__submit {
    width: 100%;
    margin-top: 8px;
}
</style>
