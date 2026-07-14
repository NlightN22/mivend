<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { MvButton, MvNotice, MvPanel } from '@mivend/ui-kit';
import { useAuthStore } from '../../stores/auth';
import SettingsSubNav from '../../components/settings/SettingsSubNav.vue';
import { endAllSessions, endSession, fetchMySessions, type SessionSummary } from '../../api/sessions';

const authStore = useAuthStore();

const sessions = ref<SessionSummary[]>([]);
const loading = ref(true);
const error = ref('');
const endingId = ref<string | null>(null);

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
</style>
