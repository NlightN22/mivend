import { reactive, toRefs } from 'vue';
import {
    normalizeCode,
    type TwoFactorEnrolment,
    type TwoFactorSignInApi,
    type TwoFactorUiError,
} from './twoFactorTypes';

export type SignInStep = 'password' | 'verify' | 'enrol' | 'recovery-sent' | 'done';

export function useTwoFactorSignIn(api: TwoFactorSignInApi) {
    const state = reactive<{
        step: SignInStep;
        error: TwoFactorUiError | null;
        loading: boolean;
        enrolment: TwoFactorEnrolment | null;
        username: string;
        maskedEmail: string;
    }>({
        step: 'password',
        error: null,
        loading: false,
        enrolment: null,
        username: '',
        maskedEmail: '',
    });
    let challenge = '';
    let rememberMe = false;

    async function guarded(work: () => Promise<void>): Promise<void> {
        if (state.loading) return;
        state.loading = true;
        state.error = null;
        try {
            await work();
        } catch {
            state.error = 'UNKNOWN';
        } finally {
            state.loading = false;
        }
    }

    function backToPassword(error: TwoFactorUiError | null): void {
        challenge = '';
        state.enrolment = null;
        state.step = 'password';
        state.error = error;
    }

    async function loadEnrolment(): Promise<void> {
        const result = await api.startEnrolment(challenge);
        if (result.kind === 'enrolment') state.enrolment = result.enrolment;
        else backToPassword(result.failure);
    }

    function submitPassword(username: string, password: string, remember: boolean): Promise<void> {
        return guarded(async () => {
            state.username = username;
            rememberMe = remember;
            const result = await api.start(username, password);
            if (result.kind === 'failure') {
                state.error = result.failure;
            } else if (result.kind === 'none') {
                if (await api.plainLogin(username, password, remember)) state.step = 'done';
                else state.error = 'INVALID_CREDENTIALS';
            } else {
                challenge = result.challenge;
                if (result.stage === 'VERIFY') {
                    state.step = 'verify';
                } else {
                    await loadEnrolment();
                    if (state.enrolment) state.step = 'enrol';
                }
            }
        });
    }

    function submitCode(rawCode: string): Promise<void> {
        return guarded(async () => {
            const result = await api.authenticate(challenge, normalizeCode(rawCode), rememberMe);
            if (result.kind === 'ok') {
                state.step = 'done';
            } else if (result.failure === 'INVALID_CODE') {
                state.error = 'INVALID_CODE';
            } else if (result.failure === 'ENROLMENT_EXPIRED' && state.step === 'enrol') {
                await loadEnrolment();
                state.error = 'ENROLMENT_EXPIRED';
            } else {
                backToPassword(result.failure);
            }
        });
    }

    function requestRecovery(): Promise<void> {
        return guarded(async () => {
            const result = await api.requestRecovery(challenge);
            if (result.kind === 'sent') {
                state.maskedEmail = result.maskedEmailAddress;
                state.step = 'recovery-sent';
            } else {
                backToPassword(result.failure);
            }
        });
    }

    function backToCode(): void {
        state.error = null;
        state.step = 'verify';
    }

    return {
        ...toRefs(state),
        submitPassword,
        submitCode,
        requestRecovery,
        backToCode,
        back: () => backToPassword(null),
    };
}
