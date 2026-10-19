<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { formatDate } from '../../i18n/format';
import { endSession, fetchMySessions, type SessionSummary } from '../../api/sessions';

const { t } = useI18n();
const sessions = ref<SessionSummary[]>([]);
const sessionsLoading = ref(true);
const sessionsError = ref('');

async function loadSessions() {
    sessionsLoading.value = true;
    sessionsError.value = '';
    try {
        sessions.value = await fetchMySessions();
    } catch (e) {
        sessionsError.value = e instanceof Error ? e.message : t('settings.security.loadFailed');
    } finally {
        sessionsLoading.value = false;
    }
}

onMounted(loadSessions);

async function handleEndSession(id: string) {
    await endSession(id);
    await loadSessions();
}

const showPasswordForm = ref(false);
const passwordForm = ref({ current: '', next: '', confirm: '' });
</script>

<template>
    <div class="set-block">
        <div class="set-block__head">
            <div>
                <h2 class="set-block__title">{{ $t('settings.security.title') }}</h2>
                <div class="set-block__sub">
                    {{ $t('settings.security.sub') }}
                </div>
            </div>
            <button class="set-btn" @click="showPasswordForm = !showPasswordForm">
                {{
                    showPasswordForm
                        ? $t('settings.security.cancel')
                        : $t('settings.security.changePassword')
                }}
            </button>
        </div>

        <div v-if="showPasswordForm" class="set-form set-form--narrow set-form--password">
            <label class="set-field set-field--wide">
                <span>{{ $t('settings.security.currentPassword') }}</span>
                <input v-model="passwordForm.current" type="password" />
            </label>
            <label class="set-field">
                <span>{{ $t('settings.security.newPassword') }}</span>
                <input v-model="passwordForm.next" type="password" />
            </label>
            <label class="set-field">
                <span>{{ $t('settings.security.confirmPassword') }}</span>
                <input v-model="passwordForm.confirm" type="password" />
            </label>
            <div class="set-field set-field--wide">
                <button class="set-btn set-btn--primary" style="width: fit-content">
                    {{ $t('settings.security.updatePassword') }}
                </button>
            </div>
        </div>

        <div class="set-sessions" :class="{ 'set-sessions--spaced': showPasswordForm }">
            <div v-if="sessionsError" class="set-session__note">{{ sessionsError }}</div>
            <div v-for="s in sessions" :key="s.id" class="set-session">
                <span class="set-session__icon">{{
                    s.deviceLabel.includes('Android') || s.deviceLabel.includes('iOS') ? '📱' : '💻'
                }}</span>
                <div class="set-session__info">
                    <div class="set-session__title">{{ s.deviceLabel }}</div>
                    <div class="set-session__note">
                        {{
                            s.current
                                ? $t('settings.security.currentSession')
                                : $t('settings.security.signedIn')
                        }}
                        ·
                        {{
                            $t('settings.security.since', {
                                date: formatDate(s.createdAt, {
                                    dateStyle: 'medium',
                                    timeStyle: 'short',
                                }),
                            })
                        }}
                    </div>
                </div>
                <span v-if="s.current" class="set-pill">{{ $t('settings.security.current') }}</span>
                <button v-else class="set-btn" @click="handleEndSession(s.id)">
                    {{ $t('settings.security.endSession') }}
                </button>
            </div>
        </div>
    </div>
</template>

<style scoped src="./SettingsPage.css"></style>

<style scoped>
.set-form--password {
    margin-bottom: 4px;
    padding-bottom: 16px;
    border-bottom: 1px solid #edf2ef;
}
.set-sessions {
    display: grid;
    gap: 8px;
}
.set-sessions--spaced {
    margin-top: 16px;
}
.set-session {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    background: #f7fbf9;
    border: 1px solid #edf2ef;
    border-radius: 14px;
}
.set-session__icon {
    font-size: 20px;
    flex-shrink: 0;
}
.set-session__info {
    flex: 1;
    min-width: 0;
}
.set-session__title {
    font-size: 14px;
    font-weight: 800;
    color: #14231f;
    margin-bottom: 2px;
}
.set-session__note {
    font-size: 12px;
    color: #66736e;
}
</style>
