<script setup lang="ts">
import { formatDateTime } from '../../i18n/format';
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { MvButton, MvFormField, MvNotice, MvPanel, MvPasswordInput } from '@mivend/ui-kit';
import { useAuthStore } from '../../stores/auth';
import {
    endAllSessions,
    endSession,
    fetchMySessions,
    type SessionSummary,
} from '../../api/sessions';
import { changeOwnPassword } from '../../api/account';
import SecurityNewDeviceEmail from './SecurityNewDeviceEmail.vue';
import SecurityTwoFactor from './SecurityTwoFactor.vue';

const { t } = useI18n();
const authStore = useAuthStore();

const sessions = ref<SessionSummary[]>([]);
const loading = ref(true);
const error = ref('');
const endingId = ref<string | null>(null);

// Plain self-service form: the default-account banner and the breached-password redirect (#278) both link here.
const newPassword = ref('');
const confirmPassword = ref('');
const passwordSubmitting = ref(false);
const passwordError = ref('');
const passwordSuccess = ref(false);

async function handleChangePassword(): Promise<void> {
    passwordError.value = '';
    passwordSuccess.value = false;
    if (newPassword.value.length < 8) {
        passwordError.value = t('settingsSystem.security.passwordTooShort');
        return;
    }
    if (newPassword.value !== confirmPassword.value) {
        passwordError.value = t('settingsSystem.security.passwordMismatch');
        return;
    }
    passwordSubmitting.value = true;
    try {
        await changeOwnPassword(newPassword.value);
        passwordSuccess.value = true;
        await authStore.fetchActiveAdministrator();
        newPassword.value = '';
        confirmPassword.value = '';
    } catch (e) {
        const message = e instanceof Error ? e.message : '';
        passwordError.value = message.includes('PASSWORD_BREACHED')
            ? t('settingsSystem.security.passwordBreached')
            : t('settingsSystem.security.passwordFailed');
    } finally {
        passwordSubmitting.value = false;
    }
}

async function load(): Promise<void> {
    loading.value = true;
    error.value = '';
    try {
        sessions.value = await fetchMySessions();
    } catch {
        error.value = t('settingsSystem.security.loadFailed');
    } finally {
        loading.value = false;
    }
}

onMounted(load);

async function handleEndSession(id: string): Promise<void> {
    endingId.value = id;
    try {
        await endSession(id);
        await load();
    } finally {
        endingId.value = null;
    }
}

async function handleSignOutEverywhere(): Promise<void> {
    await endAllSessions();
    await authStore.logout();
    window.location.href = '/login';
}
</script>

<template>
    <div class="security-page">
        <div class="security-page__breadcrumb">{{ t('settingsSystem.security.breadcrumb') }}</div>
        <h1 class="security-page__title">{{ t('settingsSystem.security.title') }}</h1>

        <MvNotice v-if="error" variant="error">{{ error }}</MvNotice>

        <SecurityTwoFactor />

        <SecurityNewDeviceEmail />

        <MvPanel v-if="!loading" :title="t('settingsSystem.security.sessions')">
            <ul v-if="sessions.length" class="security-page__items">
                <li v-for="s in sessions" :key="s.id" class="security-page__row">
                    <div class="security-page__identity">
                        <strong>{{ s.deviceLabel }}</strong>
                        <span class="security-page__meta">
                            {{
                                s.current
                                    ? t('settingsSystem.security.currentSession')
                                    : t('settingsSystem.security.signedIn')
                            }}
                            ·
                            {{
                                t('settingsSystem.security.since', {
                                    date: formatDateTime(s.createdAt),
                                })
                            }}
                        </span>
                    </div>
                    <span v-if="s.current" class="security-page__current">{{
                        t('settingsSystem.security.current')
                    }}</span>
                    <MvButton
                        v-else
                        variant="secondary"
                        size="sm"
                        :disabled="endingId === s.id"
                        @click="handleEndSession(s.id)"
                    >
                        {{ t('settingsSystem.security.endSession') }}
                    </MvButton>
                </li>
            </ul>
            <p v-else class="security-page__empty">{{ t('settingsSystem.security.noSessions') }}</p>
        </MvPanel>

        <MvPanel :title="t('settingsSystem.security.changePassword')">
            <MvNotice v-if="authStore.passwordChangeRequired" variant="warning">
                {{ t('settingsSystem.security.breachedCurrent') }}
            </MvNotice>
            <MvNotice v-if="authStore.isDefaultSuperadminAccount" variant="warning">
                <i18n-t keypath="settingsSystem.security.defaultAccount" tag="span" scope="global">
                    <template #account><strong>superadmin</strong></template>
                </i18n-t>
            </MvNotice>
            <form class="security-page__password-form" @submit.prevent="handleChangePassword">
                <MvFormField :label="t('settingsSystem.security.newPassword')" required>
                    <MvPasswordInput
                        v-model="newPassword"
                        :placeholder="t('settingsSystem.security.passwordPlaceholder')"
                        :show-label="t('settingsSystem.security.show')"
                        :hide-label="t('settingsSystem.security.hide')"
                    />
                </MvFormField>
                <MvFormField :label="t('settingsSystem.security.confirmPassword')" required>
                    <MvPasswordInput
                        v-model="confirmPassword"
                        :placeholder="t('settingsSystem.security.confirmPassword')"
                        :show-label="t('settingsSystem.security.show')"
                        :hide-label="t('settingsSystem.security.hide')"
                    />
                </MvFormField>
                <MvNotice v-if="passwordError" variant="error">{{ passwordError }}</MvNotice>
                <MvNotice v-if="passwordSuccess" variant="success">{{
                    t('settingsSystem.security.passwordChanged')
                }}</MvNotice>
                <div class="security-page__password-actions">
                    <MvButton native-type="submit" :loading="passwordSubmitting">{{
                        t('settingsSystem.security.changePassword')
                    }}</MvButton>
                </div>
            </form>
        </MvPanel>

        <MvPanel v-if="!loading" :title="t('settingsSystem.security.signOut')">
            <div class="security-page__danger">
                <p>{{ t('settingsSystem.security.signOutHint') }}</p>
                <MvButton variant="danger" @click="handleSignOutEverywhere">{{
                    t('settingsSystem.security.signOutEverywhere')
                }}</MvButton>
            </div>
        </MvPanel>
    </div>
</template>

<style scoped>
.security-page__breadcrumb {
    color: var(--el-text-color-secondary);
    font-size: 13px;
    margin-bottom: 4px;
}

.security-page__title {
    margin: 0 0 4px;
}

.security-page__items {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.security-page__row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
}

.security-page__identity {
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.security-page__meta {
    font-size: 12px;
    color: var(--el-text-color-secondary);
}

.security-page__current {
    font-size: 12px;
    font-weight: 700;
    color: var(--el-color-primary-dark-2);
}

.security-page__empty {
    color: var(--el-text-color-secondary);
}

.security-page__danger {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
}

.security-page__password-form {
    display: flex;
    flex-direction: column;
    gap: 16px;
    max-width: 360px;
}

.security-page__password-actions {
    display: flex;
    justify-content: flex-end;
}
</style>
