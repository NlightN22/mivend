<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { useRedirectCountdown } from '../../composables/useRedirectCountdown';
import {
    readSiteIconUrl,
    readSiteName,
    MvLogo,
    MvAvatar,
    MvFormField,
    MvPasswordInput,
    MvButton,
    MvNotice,
} from '@mivend/ui-kit';
import {
    resetAdministratorPassword,
    fetchAdministratorForPasswordResetToken,
    type ResetAdministratorPasswordReason,
    type PasswordResetIdentity,
} from '../../api/users';

const { t } = useI18n();
const siteName = readSiteName();
const siteIconUrl = readSiteIconUrl();

// Issue #119 Phase 2 — reached from the emailed password-reset link
// (AdministratorProvisioningService.createFromPending), no session yet. Same shell/layout as
// LoginPage.vue (see router/index.ts's `meta: { layout: 'auth' }`), reused later for any manual
// "reset this Administrator's password" staff action per the issue's Decision 3 step 3.
const route = useRoute();
const router = useRouter();

const token = computed(() => (route.query.token as string) ?? '');

type ViewState = 'form' | 'success' | 'expired' | 'invalid' | 'validation';
const state = ref<ViewState>(token.value ? 'form' : 'invalid');

// Shown on every state (form, success, and the error states) so the person can confirm "is this
// actually my account" before setting a password, and see whose account it was afterwards —
// deliberately fetched read-only, never gates the form itself (a lookup failure just omits the
// name, it doesn't block a valid token from being used).
const identity = ref<PasswordResetIdentity | null>(null);
onMounted(async () => {
    if (!token.value) return;
    try {
        identity.value = await fetchAdministratorForPasswordResetToken(token.value);
    } catch {
        identity.value = null;
    }
});

const form = reactive({ password: '', confirmPassword: '' });
const loading = ref(false);
const validationMessage = ref('');

const MIN_PASSWORD_LENGTH = 8;
const mismatchError = computed(
    () => form.confirmPassword.length > 0 && form.password !== form.confirmPassword,
);
const tooShortError = computed(
    () => form.password.length > 0 && form.password.length < MIN_PASSWORD_LENGTH,
);

const REASON_TO_STATE: Record<ResetAdministratorPasswordReason, ViewState> = {
    expired: 'expired',
    invalid: 'invalid',
    validation: 'validation',
};

async function handleSubmit(): Promise<void> {
    if (!form.password || mismatchError.value || tooShortError.value) return;
    loading.value = true;
    try {
        const result = await resetAdministratorPassword(token.value, form.password);
        if (result.success) {
            state.value = 'success';
            start();
        } else {
            state.value = result.reason ? REASON_TO_STATE[result.reason] : 'invalid';
            if (result.reason === 'validation')
                validationMessage.value = t('auth.setPassword.validation');
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

const { remaining, start } = useRedirectCountdown(goToSignIn);
</script>

<template>
    <main class="set-password-page">
        <div class="set-password-wrap">
            <MvLogo :name="siteName" :icon-url="siteIconUrl" size="md" />

            <div class="set-password-card">
                <template v-if="state === 'form' || state === 'validation'">
                    <h1 class="set-password-card__title">{{ t('auth.setPassword.title') }}</h1>
                    <p class="set-password-card__desc">
                        {{ t('auth.setPassword.description') }}
                    </p>

                    <div v-if="identity" class="set-password-card__identity">
                        <MvAvatar :name="`${identity.firstName} ${identity.lastName}`" size="md" />
                        <div>
                            <div class="set-password-card__identity-name">
                                {{ identity.firstName }} {{ identity.lastName }}
                            </div>
                            <div class="set-password-card__identity-mail">
                                {{ identity.emailAddress }}
                            </div>
                        </div>
                    </div>

                    <MvNotice
                        v-if="state === 'validation'"
                        variant="error"
                        class="set-password-card__error"
                    >
                        {{ validationMessage }}
                    </MvNotice>

                    <form class="set-password-form" novalidate @submit.prevent="handleSubmit">
                        <MvFormField :label="t('auth.setPassword.newPassword')">
                            <MvPasswordInput
                                v-model="form.password"
                                autocomplete="new-password"
                                :show-label="t('auth.login.show')"
                                :hide-label="t('auth.login.hide')"
                                :error="tooShortError"
                            />
                        </MvFormField>

                        <MvFormField :label="t('auth.setPassword.repeatPassword')">
                            <MvPasswordInput
                                v-model="form.confirmPassword"
                                autocomplete="new-password"
                                :show-label="t('auth.login.show')"
                                :hide-label="t('auth.login.hide')"
                                :error="mismatchError"
                            />
                        </MvFormField>
                        <MvNotice v-if="mismatchError" variant="error"
                            >{{ t('auth.setPassword.mismatch') }}</MvNotice
                        >

                        <p class="set-password-card__rules">
                            {{ t('auth.setPassword.rules', { min: MIN_PASSWORD_LENGTH }) }}
                        </p>

                        <MvButton
                            variant="primary"
                            size="lg"
                            native-type="submit"
                            :loading="loading"
                            :disabled="!form.password || mismatchError || tooShortError"
                            class="set-password-form__submit"
                        >
                            {{ t('auth.setPassword.submit') }}
                        </MvButton>
                    </form>
                </template>

                <div
                    v-else-if="state === 'success'"
                    class="set-password-state set-password-state--success"
                >
                    <div class="set-password-state__icon">✓</div>
                    <h3>{{ t('auth.setPassword.savedTitle') }}</h3>
                    <p>{{ t('auth.setPassword.savedText') }}</p>

                    <div
                        v-if="identity"
                        class="set-password-card__identity set-password-state__identity"
                    >
                        <MvAvatar :name="`${identity.firstName} ${identity.lastName}`" size="md" />
                        <div>
                            <div class="set-password-card__identity-name">
                                {{ identity.firstName }} {{ identity.lastName }}
                            </div>
                            <div class="set-password-card__identity-mail">
                                {{ identity.emailAddress }}
                            </div>
                        </div>
                    </div>

                    <p role="status">{{ t('auth.setPassword.redirect', { seconds: remaining }) }}</p>

                    <MvButton variant="primary" size="lg" @click="goToSignIn"
                        >{{ t('auth.setPassword.toSignIn') }}</MvButton
                    >
                </div>

                <div v-else class="set-password-state set-password-state--error">
                    <div class="set-password-state__icon">!</div>
                    <h3>{{ t('auth.setPassword.invalidTitle') }}</h3>
                    <p>{{ t('auth.setPassword.invalidText') }}</p>

                    <div
                        v-if="identity"
                        class="set-password-card__identity set-password-state__identity"
                    >
                        <MvAvatar :name="`${identity.firstName} ${identity.lastName}`" size="md" />
                        <div>
                            <div class="set-password-card__identity-name">
                                {{ identity.firstName }} {{ identity.lastName }}
                            </div>
                            <div class="set-password-card__identity-mail">
                                {{ identity.emailAddress }}
                            </div>
                        </div>
                    </div>

                    <MvButton variant="secondary" size="lg" @click="goToSignIn"
                        >{{ t('auth.setPassword.backToSignIn') }}</MvButton
                    >
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
    background: var(--el-bg-color-page);
}

.set-password-wrap {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 24px;
}

.set-password-card {
    background: var(--app-surface);
    border: 1px solid var(--el-border-color-light);
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
    color: var(--el-text-color-secondary);
    margin: 0 0 20px;
}

.set-password-card__error {
    margin-bottom: 16px;
}

.set-password-card__identity {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 14px;
    background: var(--el-fill-color-light);
    border: 1px solid var(--el-border-color-light);
    border-radius: 12px;
    margin-bottom: 20px;
    text-align: left;
}

.set-password-state__identity {
    margin: 4px auto 20px;
}

.set-password-card__identity-name {
    font-size: 14px;
    font-weight: 800;
    line-height: 1.3;
    margin-bottom: 3px;
}

.set-password-card__identity-mail {
    font-size: 12px;
    color: var(--el-text-color-secondary);
    word-break: break-all;
}

.set-password-form {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.set-password-card__rules {
    margin: -4px 0 0;
    padding: 12px 13px;
    border-radius: 10px;
    background: var(--el-fill-color-light);
    border: 1px solid var(--el-border-color-light);
    font-size: 11px;
    line-height: 1.55;
    color: var(--app-text-grey);
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
    background: var(--app-ok-bg);
    color: var(--app-ok-fg);
}

.set-password-state--error .set-password-state__icon {
    background: var(--app-danger-bg);
    color: var(--app-danger-fg);
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
    color: var(--el-text-color-secondary);
}
</style>
