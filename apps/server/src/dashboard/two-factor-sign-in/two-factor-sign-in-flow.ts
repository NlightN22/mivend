import {
    normalizeCode,
    type TwoFactorEnrolment,
    type TwoFactorSignInApi,
    type TwoFactorUiError,
} from '../../../../../packages/ui-kit/src/composables/twoFactor/twoFactorTypes';

export type SignInStep = 'password' | 'verify' | 'enrol' | 'recovery-sent' | 'done';

export interface SignInState {
    step: SignInStep;
    error: TwoFactorUiError | null;
    loading: boolean;
    enrolment: TwoFactorEnrolment | null;
    maskedEmail: string;
}

export interface SignInFlow {
    getState(): SignInState;
    subscribe(listener: () => void): () => void;
    submitPassword(username: string, password: string): Promise<void>;
    submitCode(rawCode: string): Promise<void>;
    requestRecovery(): Promise<void>;
    backToCode(): void;
    back(): void;
}

const INITIAL: SignInState = {
    step: 'password',
    error: null,
    loading: false,
    enrolment: null,
    maskedEmail: '',
};

// Same states and error mapping as the ui-kit useTwoFactorSignIn, without Vue reactivity.
export function createSignInFlow(api: TwoFactorSignInApi): SignInFlow {
    let state: SignInState = INITIAL;
    let challenge = '';
    const listeners = new Set<() => void>();

    function update(patch: Partial<SignInState>): void {
        state = { ...state, ...patch };
        listeners.forEach(listener => listener());
    }

    async function guarded(work: () => Promise<void>): Promise<void> {
        if (state.loading) return;
        update({ loading: true, error: null });
        try {
            await work();
        } catch {
            update({ error: 'UNKNOWN' });
        } finally {
            update({ loading: false });
        }
    }

    function backToPassword(error: TwoFactorUiError | null): void {
        challenge = '';
        update({ step: 'password', enrolment: null, error });
    }

    async function loadEnrolment(): Promise<void> {
        const result = await api.startEnrolment(challenge);
        if (result.kind === 'enrolment') update({ enrolment: result.enrolment });
        else backToPassword(result.failure);
    }

    return {
        getState: () => state,
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        submitPassword: (username, password) =>
            guarded(async () => {
                const result = await api.start(username, password);
                if (result.kind === 'failure') {
                    update({ error: result.failure });
                } else if (result.kind === 'none') {
                    if (await api.plainLogin(username, password, false)) update({ step: 'done' });
                    else update({ error: 'INVALID_CREDENTIALS' });
                } else {
                    challenge = result.challenge;
                    if (result.stage === 'VERIFY') {
                        update({ step: 'verify' });
                    } else {
                        await loadEnrolment();
                        if (state.enrolment) update({ step: 'enrol' });
                    }
                }
            }),
        submitCode: rawCode =>
            guarded(async () => {
                const result = await api.authenticate(challenge, normalizeCode(rawCode), false);
                if (result.kind === 'ok') {
                    update({ step: 'done' });
                } else if (result.failure === 'INVALID_CODE') {
                    update({ error: 'INVALID_CODE' });
                } else if (result.failure === 'ENROLMENT_EXPIRED' && state.step === 'enrol') {
                    await loadEnrolment();
                    update({ error: 'ENROLMENT_EXPIRED' });
                } else {
                    backToPassword(result.failure);
                }
            }),
        requestRecovery: () =>
            guarded(async () => {
                const result = await api.requestRecovery(challenge);
                if (result.kind === 'sent') {
                    update({ maskedEmail: result.maskedEmailAddress, step: 'recovery-sent' });
                } else {
                    backToPassword(result.failure);
                }
            }),
        backToCode: () => update({ error: null, step: 'verify' }),
        back: () => backToPassword(null),
    };
}
