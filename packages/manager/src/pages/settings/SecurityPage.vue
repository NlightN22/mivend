<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { MvButton, MvFormField, MvNotice, MvPanel, MvPasswordInput } from '@mivend/ui-kit';
import { useAuthStore } from '../../stores/auth';
import SettingsSubNav from '../../components/settings/SettingsSubNav.vue';
import { endAllSessions, endSession, fetchMySessions, type SessionSummary } from '../../api/sessions';
import { changeOwnPassword } from '../../api/account';

const authStore = useAuthStore();

const sessions = ref<SessionSummary[]>([]);
const loading = ref(true);
const error = ref('');
const endingId = ref<string | null>(null);

// Real incident (2026-09-12): the default superadmin/superadmin account had no way to change its
// own password anywhere in the manager portal at all — DefaultLayout.vue's warning banner links
// here. Deliberately a plain self-service form, not a forced-change gate on login: this portal
// has no concept yet of a "must change password" flag on Administrator, and adding one is a
// separate, larger access-control change (a new customField + a login-flow redirect), not
// something to bolt onto this narrow fix.
const newPassword = ref('');
const confirmPassword = ref('');
const passwordSubmitting = ref(false);
const passwordError = ref('');
const passwordSuccess = ref(false);

async function handleChangePassword(): Promise<void> {
    passwordError.value = '';
    passwordSuccess.value = false;
    if (newPassword.value.length < 8) {
        passwordError.value = 'Password must be at least 8 characters.';
        return;
    }
    if (newPassword.value !== confirmPassword.value) {
        passwordError.value = 'Passwords do not match.';
        return;
    }
    passwordSubmitting.value = true;
    try {
        await changeOwnPassword(newPassword.value);
        passwordSuccess.value = true;
        newPassword.value = '';
        confirmPassword.value = '';
    } catch (e) {
        passwordError.value = e instanceof Error ? e.message : 'Could not change the password';
    } finally {
        passwordSubmitting.value = false;
    }
}

async function load(): Promise<void> {
    loading.value = true;
    error.value = '';
    try {
        sessions.value = await fetchMySessions();
    } catch (e) {
        error.value = e instanceof Error ? e.message : 'Could not load sessions';
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
        <div class="security-page__breadcrumb">Workspace / Settings</div>
        <h1 class="security-page__title">Security</h1>
        <SettingsSubNav active="security" />

        <MvNotice v-if="error" variant="error">{{ error }}</MvNotice>

        <MvPanel v-if="!loading" title="Active sessions">
            <ul v-if="sessions.length" class="security-page__items">
                <li v-for="s in sessions" :key="s.id" class="security-page__row">
                    <div class="security-page__identity">
                        <strong>{{ s.deviceLabel }}</strong>
                        <span class="security-page__meta">
                            {{ s.current ? 'Current session' : 'Signed in' }} · since
                            {{ new Date(s.createdAt).toLocaleString() }}
                        </span>
                    </div>
                    <span v-if="s.current" class="security-page__current">Current</span>
                    <MvButton
                        v-else
                        variant="secondary"
                        size="sm"
                        :disabled="endingId === s.id"
                        @click="handleEndSession(s.id)"
                    >
                        End session
                    </MvButton>
                </li>
            </ul>
            <p v-else class="security-page__empty">No active sessions.</p>
        </MvPanel>

        <MvPanel title="Change password">
            <MvNotice v-if="authStore.isDefaultSuperadminAccount" variant="warning">
                You're currently using the default <strong>superadmin</strong> account and its
                default password — set a new password below.
            </MvNotice>
            <form class="security-page__password-form" @submit.prevent="handleChangePassword">
                <MvFormField label="New password" required>
                    <MvPasswordInput v-model="newPassword" placeholder="At least 8 characters" />
                </MvFormField>
                <MvFormField label="Confirm new password" required>
                    <MvPasswordInput v-model="confirmPassword" placeholder="Repeat the new password" />
                </MvFormField>
                <MvNotice v-if="passwordError" variant="error">{{ passwordError }}</MvNotice>
                <MvNotice v-if="passwordSuccess" variant="success">Password changed.</MvNotice>
                <div class="security-page__password-actions">
                    <MvButton native-type="submit" :loading="passwordSubmitting">Change password</MvButton>
                </div>
            </form>
        </MvPanel>

        <MvPanel v-if="!loading" title="Sign out">
            <div class="security-page__danger">
                <p>Sign out from all devices, including this one.</p>
                <MvButton variant="danger" @click="handleSignOutEverywhere">Sign out everywhere</MvButton>
            </div>
        </MvPanel>
    </div>
</template>

<style scoped>
.security-page__breadcrumb {
    color: var(--el-text-color-secondary, #6b7280);
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
    color: var(--el-text-color-secondary, #6b7280);
}

.security-page__current {
    font-size: 12px;
    font-weight: 700;
    color: var(--el-color-primary-dark-2, #008a70);
}

.security-page__empty {
    color: var(--el-text-color-secondary, #6b7280);
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
