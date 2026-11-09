<script setup lang="ts">
import { onMounted, ref } from 'vue';
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
        passwordError.value = 'Пароль должен быть не короче 8 символов.';
        return;
    }
    if (newPassword.value !== confirmPassword.value) {
        passwordError.value = 'Пароли не совпадают.';
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
            ? 'Этот пароль встречается в известных утечках данных. Выберите другой.'
            : 'Не удалось изменить пароль';
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
        error.value = 'Не удалось загрузить сеансы';
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
        <div class="security-page__breadcrumb">Рабочее пространство / Настройки</div>
        <h1 class="security-page__title">Безопасность</h1>

        <MvNotice v-if="error" variant="error">{{ error }}</MvNotice>

        <SecurityTwoFactor />

        <SecurityNewDeviceEmail />

        <MvPanel v-if="!loading" title="Активные сеансы">
            <ul v-if="sessions.length" class="security-page__items">
                <li v-for="s in sessions" :key="s.id" class="security-page__row">
                    <div class="security-page__identity">
                        <strong>{{ s.deviceLabel }}</strong>
                        <span class="security-page__meta">
                            {{ s.current ? 'Текущий сеанс' : 'Вход выполнен' }} · с
                            {{ new Date(s.createdAt).toLocaleString('ru-RU') }}
                        </span>
                    </div>
                    <span v-if="s.current" class="security-page__current">Текущий</span>
                    <MvButton
                        v-else
                        variant="secondary"
                        size="sm"
                        :disabled="endingId === s.id"
                        @click="handleEndSession(s.id)"
                    >
                        Завершить сеанс
                    </MvButton>
                </li>
            </ul>
            <p v-else class="security-page__empty">Нет активных сеансов.</p>
        </MvPanel>

        <MvPanel title="Смена пароля">
            <MvNotice v-if="authStore.passwordChangeRequired" variant="warning">
                Ваш текущий пароль встречается в известных утечках данных. Смените его сейчас.
            </MvNotice>
            <MvNotice v-if="authStore.isDefaultSuperadminAccount" variant="warning">
                Вы используете стандартную учётную запись <strong>superadmin</strong> с паролем по
                умолчанию — задайте новый пароль ниже.
            </MvNotice>
            <form class="security-page__password-form" @submit.prevent="handleChangePassword">
                <MvFormField label="Новый пароль" required>
                    <MvPasswordInput v-model="newPassword" placeholder="Не менее 8 символов" show-label="Показать" hide-label="Скрыть" />
                </MvFormField>
                <MvFormField label="Повторите новый пароль" required>
                    <MvPasswordInput
                        v-model="confirmPassword"
                        placeholder="Повторите новый пароль"
                        show-label="Показать"
                        hide-label="Скрыть"
                    />
                </MvFormField>
                <MvNotice v-if="passwordError" variant="error">{{ passwordError }}</MvNotice>
                <MvNotice v-if="passwordSuccess" variant="success">Пароль изменён.</MvNotice>
                <div class="security-page__password-actions">
                    <MvButton native-type="submit" :loading="passwordSubmitting"
                        >Сменить пароль</MvButton
                    >
                </div>
            </form>
        </MvPanel>

        <MvPanel v-if="!loading" title="Выход">
            <div class="security-page__danger">
                <p>Выйти со всех устройств, включая это.</p>
                <MvButton variant="danger" @click="handleSignOutEverywhere"
                    >Выйти везде</MvButton
                >
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
