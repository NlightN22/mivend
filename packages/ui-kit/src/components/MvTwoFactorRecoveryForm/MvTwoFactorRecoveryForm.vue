<script setup lang="ts">
import { ref } from 'vue';
import MvButton from '../MvButton/MvButton.vue';
import MvFormField from '../MvFormField/MvFormField.vue';
import MvNotice from '../MvNotice/MvNotice.vue';
import MvPasswordInput from '../MvPasswordInput/MvPasswordInput.vue';
import type { TwoFactorUiError } from '../../composables/twoFactor/twoFactorTypes';
import type { TwoFactorLabels } from '../../composables/twoFactor/twoFactorLabels';

defineProps<{
    invalid: boolean;
    error: TwoFactorUiError | null;
    loading: boolean;
    labels: TwoFactorLabels;
}>();
const emit = defineEmits<{ submit: [password: string]; toSignIn: [] }>();
const password = ref('');
</script>

<template>
    <div class="mv-tf-recovery">
        <h1 class="mv-tf-recovery__title">{{ labels.recoveryPageTitle }}</h1>
        <template v-if="invalid">
            <MvNotice variant="error">{{ labels.recoveryInvalid }}</MvNotice>
        </template>
        <form
            v-else
            novalidate
            class="mv-tf-recovery__form"
            @submit.prevent="emit('submit', password)"
        >
            <p class="mv-tf-recovery__sub">{{ labels.recoveryPageSub }}</p>
            <MvNotice v-if="error" variant="error">{{ labels.errors[error] }}</MvNotice>
            <MvFormField :label="labels.passwordLabel">
                <MvPasswordInput
                    v-model="password"
                    autocomplete="current-password"
                    :error="!!error"
                />
            </MvFormField>
            <MvButton
                variant="primary"
                size="lg"
                native-type="submit"
                :loading="loading"
                :disabled="!password"
                class="mv-tf-recovery__submit"
            >
                {{ labels.recoveryComplete }}
            </MvButton>
        </form>
        <button type="button" class="mv-tf-recovery__link" @click="emit('toSignIn')">
            {{ labels.backToSignIn }}
        </button>
    </div>
</template>

<style scoped>
.mv-tf-recovery,
.mv-tf-recovery__form {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 14px;
}
.mv-tf-recovery__title {
    margin: 0;
    font-size: 26px;
    font-weight: 900;
    line-height: 1.1;
    letter-spacing: -0.04em;
    color: var(--app-nav-text-strong);
}
.mv-tf-recovery__sub {
    margin: 0;
    font-size: 14px;
    line-height: 1.45;
    color: var(--app-slate-fg);
}
.mv-tf-recovery__submit {
    width: 100%;
    min-height: 56px;
}
.mv-tf-recovery__link {
    justify-self: start;
    padding: 0;
    border: 0;
    background: none;
    font: inherit;
    font-size: 13px;
    font-weight: 700;
    color: var(--app-nav-accent);
    cursor: pointer;
}
</style>
