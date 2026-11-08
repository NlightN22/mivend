<script setup lang="ts">
import { ref } from 'vue';
import MvButton from '../MvButton/MvButton.vue';
import MvFormField from '../MvFormField/MvFormField.vue';
import MvNotice from '../MvNotice/MvNotice.vue';
import MvOtpInput from '../MvOtpInput/MvOtpInput.vue';
import MvPasswordInput from '../MvPasswordInput/MvPasswordInput.vue';
import MvTwoFactorEnrol from '../MvTwoFactorEnrol/MvTwoFactorEnrol.vue';
import { isCompleteCode } from '../../composables/twoFactor/twoFactorTypes';
import type {
    TwoFactorEnrolment,
    TwoFactorStatusView,
    TwoFactorUiError,
} from '../../composables/twoFactor/twoFactorTypes';
import type { TwoFactorLabels } from '../../composables/twoFactor/twoFactorLabels';

const props = defineProps<{
    status: TwoFactorStatusView | null;
    enrolment: TwoFactorEnrolment | null;
    error: TwoFactorUiError | null;
    loading: boolean;
    justEnabled: boolean;
    labels: TwoFactorLabels;
}>();
const emit = defineEmits<{
    begin: [password: string, currentCode: string];
    confirm: [code: string];
    cancel: [];
}>();

const open = ref(false);
const password = ref('');
const currentCode = ref('');
const newCode = ref('');

const canBegin = (): boolean =>
    !!password.value && (!props.status?.enrolled || isCompleteCode(currentCode.value));

function close(): void {
    open.value = false;
    password.value = '';
    currentCode.value = '';
    newCode.value = '';
    emit('cancel');
}
</script>

<template>
    <section v-if="status" class="mv-tf-settings">
        <div class="mv-tf-settings__head">
            <div>
                <h2 class="mv-tf-settings__title">{{ labels.settingsTitle }}</h2>
                <p class="mv-tf-settings__sub">{{ labels.settingsSub }}</p>
            </div>
            <span
                class="mv-tf-settings__badge"
                :class="{ 'mv-tf-settings__badge--on': status.enrolled }"
            >
                {{ status.enrolled ? labels.statusOn : labels.statusOff }}
            </span>
        </div>

        <MvNotice v-if="status.required && !status.enrolled" variant="warning">
            {{ labels.statusRequired }}
        </MvNotice>
        <MvNotice v-if="justEnabled && !open" variant="success">{{ labels.enabledDone }}</MvNotice>
        <MvNotice v-if="error" variant="error">{{ labels.errors[error] }}</MvNotice>

        <MvButton v-if="!open" variant="secondary" @click="open = true">
            {{ status.enrolled ? labels.changeDevice : labels.enableDevice }}
        </MvButton>

        <form
            v-else-if="!enrolment"
            class="mv-tf-settings__form"
            novalidate
            @submit.prevent="emit('begin', password, currentCode)"
        >
            <MvFormField :label="labels.passwordLabel">
                <MvPasswordInput v-model="password" autocomplete="current-password" />
            </MvFormField>
            <MvFormField v-if="status.enrolled" :label="labels.currentCodeLabel">
                <MvOtpInput v-model="currentCode" :aria-label="labels.currentCodeLabel" />
            </MvFormField>
            <div class="mv-tf-settings__actions">
                <MvButton
                    variant="primary"
                    native-type="submit"
                    :loading="loading"
                    :disabled="!canBegin()"
                >
                    {{ labels.settingsContinue }}
                </MvButton>
                <MvButton variant="secondary" @click="close">{{ labels.cancel }}</MvButton>
            </div>
        </form>

        <form
            v-else
            class="mv-tf-settings__form"
            novalidate
            @submit.prevent="emit('confirm', newCode)"
        >
            <MvTwoFactorEnrol :enrolment="enrolment" :labels="labels" />
            <MvFormField :label="labels.codeLabel">
                <MvOtpInput v-model="newCode" autofocus :aria-label="labels.codeLabel" />
            </MvFormField>
            <div class="mv-tf-settings__actions">
                <MvButton
                    variant="primary"
                    native-type="submit"
                    :loading="loading"
                    :disabled="!isCompleteCode(newCode)"
                >
                    {{ labels.enrolSubmit }}
                </MvButton>
                <MvButton variant="secondary" @click="close">{{ labels.cancel }}</MvButton>
            </div>
        </form>
    </section>
</template>

<style scoped>
.mv-tf-settings,
.mv-tf-settings__form {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 14px;
    justify-items: start;
}
.mv-tf-settings > *,
.mv-tf-settings__form {
    max-width: 440px;
    width: 100%;
}
.mv-tf-settings__head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
}
.mv-tf-settings__title {
    margin: 0 0 4px;
    font-size: 18px;
    font-weight: 800;
    color: var(--app-nav-text-strong);
}
.mv-tf-settings__sub {
    margin: 0;
    font-size: 13px;
    line-height: 1.45;
    color: var(--app-slate-fg);
}
.mv-tf-settings__badge {
    flex-shrink: 0;
    padding: 4px 10px;
    border-radius: 999px;
    border: 1px solid var(--app-nav-border-strong);
    font-size: 12px;
    font-weight: 800;
    color: var(--app-slate-fg);
}
.mv-tf-settings__badge--on {
    border-color: var(--el-color-primary);
    color: var(--app-nav-accent);
}
.mv-tf-settings__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}
</style>
