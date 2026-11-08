<script setup lang="ts">
import { ref } from 'vue';
import MvButton from '../MvButton/MvButton.vue';
import MvFormField from '../MvFormField/MvFormField.vue';
import MvInput from '../MvInput/MvInput.vue';
import MvNotice from '../MvNotice/MvNotice.vue';
import MvOtpInput from '../MvOtpInput/MvOtpInput.vue';
import MvTwoFactorEnrol from '../MvTwoFactorEnrol/MvTwoFactorEnrol.vue';
import { isCompleteCode } from '../../composables/twoFactor/twoFactorTypes';
import type {
    TwoFactorEnrolment,
    TwoFactorUiError,
} from '../../composables/twoFactor/twoFactorTypes';
import type { TwoFactorLabels } from '../../composables/twoFactor/twoFactorLabels';
import type { SignInStep } from '../../composables/twoFactor/useTwoFactorSignIn';

const props = defineProps<{
    step: Exclude<SignInStep, 'password' | 'done'>;
    error: TwoFactorUiError | null;
    loading: boolean;
    enrolment: TwoFactorEnrolment | null;
    username: string;
    labels: TwoFactorLabels;
}>();
const emit = defineEmits<{
    code: [code: string];
    recover: [];
    sendRecovery: [emailAddress: string];
    back: [];
}>();

const code = ref('');
const email = ref(props.username);
</script>

<template>
    <div class="mv-tf-step">
        <template v-if="step === 'verify' || step === 'enrol'">
            <h1 class="mv-tf-step__title">
                {{ step === 'enrol' ? labels.enrolTitle : labels.codeTitle }}
            </h1>
            <p class="mv-tf-step__sub">
                {{ step === 'enrol' ? labels.enrolSubtitle : labels.codeSubtitle }}
            </p>
            <MvNotice v-if="error" variant="error">{{ labels.errors[error] }}</MvNotice>
            <MvTwoFactorEnrol
                v-if="step === 'enrol' && enrolment"
                :enrolment="enrolment"
                :labels="labels"
            />
            <form class="mv-tf-step__form" novalidate @submit.prevent="emit('code', code)">
                <MvFormField :label="labels.codeLabel">
                    <MvOtpInput
                        v-model="code"
                        :error="!!error"
                        autofocus
                        :aria-label="labels.codeLabel"
                    />
                </MvFormField>
                <MvButton
                    variant="primary"
                    size="lg"
                    native-type="submit"
                    :loading="loading"
                    :disabled="!isCompleteCode(code)"
                    class="mv-tf-step__submit"
                >
                    {{ step === 'enrol' ? labels.enrolSubmit : labels.codeSubmit }}
                </MvButton>
            </form>
            <div class="mv-tf-step__links">
                <button v-if="step === 'verify'" type="button" @click="emit('recover')">
                    {{ labels.lostAccess }}
                </button>
                <button type="button" @click="emit('back')">{{ labels.back }}</button>
            </div>
        </template>

        <template v-else-if="step === 'recovery'">
            <h1 class="mv-tf-step__title">{{ labels.recoveryTitle }}</h1>
            <p class="mv-tf-step__sub">{{ labels.recoverySubtitle }}</p>
            <MvNotice v-if="error" variant="error">{{ labels.errors[error] }}</MvNotice>
            <form class="mv-tf-step__form" novalidate @submit.prevent="emit('sendRecovery', email)">
                <MvFormField :label="labels.emailLabel">
                    <MvInput
                        v-model="email"
                        type="email"
                        autocomplete="username"
                        :aria-label="labels.emailLabel"
                    />
                </MvFormField>
                <MvButton
                    variant="primary"
                    size="lg"
                    native-type="submit"
                    :loading="loading"
                    :disabled="!email.trim()"
                    class="mv-tf-step__submit"
                >
                    {{ labels.recoverySubmit }}
                </MvButton>
            </form>
            <div class="mv-tf-step__links">
                <button type="button" @click="emit('back')">{{ labels.back }}</button>
            </div>
        </template>

        <template v-else>
            <h1 class="mv-tf-step__title">{{ labels.recoverySentTitle }}</h1>
            <MvNotice variant="success">{{ labels.recoverySentText }}</MvNotice>
            <div class="mv-tf-step__links">
                <button type="button" @click="emit('back')">{{ labels.backToSignIn }}</button>
            </div>
        </template>
    </div>
</template>

<style scoped>
.mv-tf-step {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 14px;
}
.mv-tf-step__title {
    margin: 0;
    font-size: 26px;
    font-weight: 900;
    line-height: 1.1;
    letter-spacing: -0.04em;
    color: var(--app-nav-text-strong);
}
.mv-tf-step__sub {
    margin: 0;
    font-size: 14px;
    line-height: 1.45;
    color: var(--app-slate-fg);
}
.mv-tf-step__form {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 14px;
}
.mv-tf-step__submit {
    width: 100%;
    min-height: 56px;
}
.mv-tf-step__links {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 8px 14px;
}
.mv-tf-step__links button {
    padding: 0;
    border: 0;
    background: none;
    font: inherit;
    font-size: 13px;
    font-weight: 700;
    color: var(--app-nav-accent);
    cursor: pointer;
}
.mv-tf-step__links button:hover {
    text-decoration: underline;
}
</style>
