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

// The default-account banner and the breached-password redirect (#278) both land on this form.
const newPassword = ref('');
const confirmPassword = ref('');
const passwordSubmitting = ref(false);
const passwordError = ref('');
const passwordSuccess = ref(false);

async function handleChangePassword(): Promise<void> {
    passwordError.value = '';
    passwordSuccess.value = false;
    if (newPassword.value.length < 8) {
        passwordError.value = t('profile.security.passwordTooShort');
        return;
    }
    if (newPassword.value !== confirmPassword.value) {
        passwordError.value = t('profile.security.passwordMismatch');
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
            ? t('profile.security.passwordBreached')
            : t('profile.security.passwordFailed');
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
        error.value = t('profile.security.loadFailed');
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
    <div class="profile-security">
        <MvNotice v-if="error" variant="error">{{ error }}</MvNotice>

        <SecurityTwoFactor />

        <SecurityNewDeviceEmail />

        <MvPanel v-if="!loading" :title="t('profile.security.sessions')">
            <ul v-if="sessions.length" class="profile-security__items">
                <li v-for="s in sessions" :key="s.id" class="profile-security__row">
                    <div class="profile-security__identity">
                        <strong>{{ s.deviceLabel }}</strong>
                        <span class="profile-security__meta">
                            {{
                                s.current
                                    ? t('profile.security.currentSession')
                                    : t('profile.security.signedIn')
                            }}
                            ·
                            {{
                                t('profile.security.since', {
                                    date: formatDateTime(s.createdAt),
                                })
                            }}
                        </span>
                    </div>
                    <span v-if="s.current" class="profile-security__current">{{
                        t('profile.security.current')
                    }}</span>
                    <MvButton
                        v-else
                        variant="secondary"
                        size="sm"
                        :disabled="endingId === s.id"
                        @click="handleEndSession(s.id)"
                    >
                        {{ t('profile.security.endSession') }}
                    </MvButton>
                </li>
            </ul>
            <p v-else class="profile-security__empty">{{ t('profile.security.noSessions') }}</p>
        </MvPanel>

        <MvPanel :title="t('profile.security.changePassword')">
            <MvNotice v-if="authStore.passwordChangeRequired" variant="warning">
                {{ t('profile.security.breachedCurrent') }}
            </MvNotice>
            <MvNotice v-if="authStore.isDefaultSuperadminAccount" variant="warning">
                <i18n-t keypath="profile.security.defaultAccount" tag="span" scope="global">
                    <template #account><strong>superadmin</strong></template>
                </i18n-t>
            </MvNotice>
            <form class="profile-security__password-form" @submit.prevent="handleChangePassword">
                <MvFormField :label="t('profile.security.newPassword')" required>
                    <MvPasswordInput
                        v-model="newPassword"
                        :placeholder="t('profile.security.passwordPlaceholder')"
                        :show-label="t('profile.security.show')"
                        :hide-label="t('profile.security.hide')"
                    />
                </MvFormField>
                <MvFormField :label="t('profile.security.confirmPassword')" required>
                    <MvPasswordInput
                        v-model="confirmPassword"
                        :placeholder="t('profile.security.confirmPassword')"
                        :show-label="t('profile.security.show')"
                        :hide-label="t('profile.security.hide')"
                    />
                </MvFormField>
                <MvNotice v-if="passwordError" variant="error">{{ passwordError }}</MvNotice>
                <MvNotice v-if="passwordSuccess" variant="success">{{
                    t('profile.security.passwordChanged')
                }}</MvNotice>
                <div class="profile-security__password-actions">
                    <MvButton native-type="submit" :loading="passwordSubmitting">{{
                        t('profile.security.changePassword')
                    }}</MvButton>
                </div>
            </form>
        </MvPanel>

        <MvPanel v-if="!loading" :title="t('profile.security.signOut')">
            <div class="profile-security__danger">
                <p>{{ t('profile.security.signOutHint') }}</p>
                <MvButton variant="danger" @click="handleSignOutEverywhere">{{
                    t('profile.security.signOutEverywhere')
                }}</MvButton>
            </div>
        </MvPanel>
    </div>
</template>

<style scoped>
.profile-security__items {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.profile-security__row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
}

.profile-security__identity {
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.profile-security__meta {
    font-size: 12px;
    color: var(--el-text-color-secondary);
}

.profile-security__current {
    font-size: 12px;
    font-weight: 700;
    color: var(--el-color-primary-dark-2);
}

.profile-security__empty {
    color: var(--el-text-color-secondary);
}

.profile-security__danger {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
}

.profile-security__password-form {
    display: flex;
    flex-direction: column;
    gap: 16px;
    max-width: 360px;
}

.profile-security__password-actions {
    display: flex;
    justify-content: flex-end;
}
</style>
