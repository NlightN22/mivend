<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { MvLogo, MvFormField, MvInput, MvPasswordInput, MvButton, MvNotice } from '@mivend/ui-kit';
import { useAuthStore } from '../../stores/auth';

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();

const form = reactive({ username: '', password: '', remember: false });
const loading = ref(false);
const error = ref('');

async function handleSubmit(): Promise<void> {
    loading.value = true;
    error.value = '';
    try {
        const ok = await authStore.login(form.username, form.password, form.remember);
        if (ok) {
            await router.push((route.query.redirect as string) ?? '/');
        } else {
            error.value = 'Invalid username or password';
        }
    } catch {
        error.value = 'Invalid username or password';
    } finally {
        loading.value = false;
    }
}
</script>

<template>
    <main class="login-page">
        <div class="login-wrap">
            <MvLogo size="md" />

            <div class="login-card">
                <h1 class="login-card__title">Manager portal sign in</h1>

                <MvNotice v-if="error" variant="error" class="login-card__error">
                    {{ error }}
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
