<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { MvLogo, MvFormField, MvPasswordInput, MvButton, MvNotice } from '@mivend/ui-kit';
import { resetAdministratorPassword, type ResetAdministratorPasswordReason } from '../../api/users';

// Issue #119 Phase 2 — reached from the emailed password-reset link
// (AdministratorProvisioningService.createFromPending), no session yet. Same shell/layout as
// LoginPage.vue (see router/index.ts's `meta: { layout: 'auth' }`), reused later for any manual
// "reset this Administrator's password" staff action per the issue's Decision 3 step 3.
const route = useRoute();
const router = useRouter();

const token = computed(() => (route.query.token as string) ?? '');

type ViewState = 'form' | 'success' | 'expired' | 'invalid' | 'validation';
const state = ref<ViewState>(token.value ? 'form' : 'invalid');

const form = reactive({ password: '', confirmPassword: '' });
const loading = ref(false);
const validationMessage = ref('');

const mismatchError = computed(
    () => form.confirmPassword.length > 0 && form.password !== form.confirmPassword,
);

const REASON_TO_STATE: Record<ResetAdministratorPasswordReason, ViewState> = {
    expired: 'expired',
    invalid: 'invalid',
    validation: 'validation',
};

async function handleSubmit(): Promise<void> {
    if (!form.password || mismatchError.value) return;
    loading.value = true;
    try {
        const result = await resetAdministratorPassword(token.value, form.password);
        if (result.success) {
            state.value = 'success';
        } else {
            state.value = result.reason ? REASON_TO_STATE[result.reason] : 'invalid';
            if (result.reason === 'validation') validationMessage.value = 'Password does not meet requirements.';
        }
    } catch {
        state.value = 'invalid';
    } finally {
        loading.value = false;
    }
}

function goToSignIn(): void {
    void router.push('/login');
}
</script>

<template>
    <main class="set-password-page">
        <div class="set-password-wrap">
            <MvLogo size="md" />

            <div class="set-password-card">
                <template v-if="state === 'form' || state === 'validation'">
                    <h1 class="set-password-card__title">Set your password</h1>
                    <p class="set-password-card__desc">Create a password for your manager portal account.</p>

                    <MvNotice v-if="state === 'validation'" variant="error" class="set-password-card__error">
                        {{ validationMessage }}
                    </MvNotice>

                    <form class="set-password-form" novalidate @submit.prevent="handleSubmit">
                        <MvFormField label="New password">
                            <MvPasswordInput v-model="form.password" autocomplete="new-password" />
                        </MvFormField>

                        <MvFormField label="Confirm password">
                            <MvPasswordInput
                                v-model="form.confirmPassword"
                                autocomplete="new-password"
                                :error="mismatchError"
                            />
                        </MvFormField>
                        <MvNotice v-if="mismatchError" variant="error">Passwords do not match.</MvNotice>

                        <MvButton
                            variant="primary"
                            size="lg"
                            native-type="submit"
                            :loading="loading"
                            :disabled="!form.password || mismatchError"
                            class="set-password-form__submit"
                        >
                            Save password
                        </MvButton>
                    </form>
                </template>

                <div v-else-if="state === 'success'" class="set-password-state set-password-state--success">
                    <div class="set-password-state__icon">✓</div>
                    <h3>Password saved</h3>
                    <p>Your password has been set successfully. You can now sign in to the manager portal.</p>
                    <MvButton variant="primary" size="lg" @click="goToSignIn">Go to sign in</MvButton>
                </div>

                <div v-else class="set-password-state set-password-state--error">
                    <div class="set-password-state__icon">!</div>
                    <h3>Link is invalid or expired</h3>
                    <p>This password setup link can no longer be used. Request a new invitation from an administrator.</p>
                    <MvButton variant="secondary" size="lg" @click="goToSignIn">Back to sign in</MvButton>
                </div>
            </div>
        </div>
    </main>
</template>

<style scoped>
.set-password-page {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    background: #f3f4f6;
}

.set-password-wrap {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 24px;
}

.set-password-card {
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 32px;
    width: 360px;
}

.set-password-card__title {
    font-size: 18px;
    margin: 0 0 8px;
}

.set-password-card__desc {
    font-size: 13px;
    color: var(--el-text-color-secondary, #6b7280);
    margin: 0 0 20px;
}

.set-password-card__error {
    margin-bottom: 16px;
}

.set-password-form {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.set-password-form__submit {
    width: 100%;
    margin-top: 8px;
}

.set-password-state {
    text-align: center;
    padding: 8px 2px 4px;
}

.set-password-state__icon {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    margin: 0 auto 14px;
    font-size: 22px;
    font-weight: 900;
}

.set-password-state--success .set-password-state__icon {
    background: #dff8ed;
    color: #0b8b61;
}

.set-password-state--error .set-password-state__icon {
    background: #fff0f0;
    color: #c64c4c;
}

.set-password-state h3 {
    margin: 0 0 8px;
    font-size: 19px;
}

.set-password-state p {
    margin: 0 auto 18px;
    max-width: 300px;
    font-size: 13px;
    line-height: 1.55;
    color: var(--el-text-color-secondary, #6b7280);
}
</style>
