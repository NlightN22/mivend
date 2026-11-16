import { reactive, Ref, toRefs } from 'vue';
import type {
    TwoFactorEnrolment,
    TwoFactorSettingsApi,
    TwoFactorStatusView,
    TwoFactorUiError,
} from './twoFactorTypes';
import { normalizeCode } from './twoFactorTypes';

export interface UseTwoFactorSettings {
    load: () => Promise<void>;
    begin: (password: string, currentCode: string) => Promise<void>;
    confirm: (code: string) => Promise<void>;
    cancel: () => void;
    status: Ref<{
        required: boolean;
        enrolled: boolean;
        activatedAt: string | null;
        pendingEnrolment: boolean;
    } | null>;
    enrolment: Ref<{ otpauthUri: string; secret: string; expiresAt: string } | null>;
    error: Ref<TwoFactorUiError | null>;
    loading: Ref<boolean>;
    justEnabled: Ref<boolean>;
}

export function useTwoFactorSettings(api: TwoFactorSettingsApi): UseTwoFactorSettings {
    const state = reactive<{
        status: TwoFactorStatusView | null;
        enrolment: TwoFactorEnrolment | null;
        error: TwoFactorUiError | null;
        loading: boolean;
        justEnabled: boolean;
    }>({ status: null, enrolment: null, error: null, loading: false, justEnabled: false });

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

    const load = (): Promise<void> =>
        guarded(async () => {
            state.status = await api.status();
        });

    const begin = (password: string, currentCode: string): Promise<void> =>
        guarded(async () => {
            const code = state.status?.enrolled ? normalizeCode(currentCode) : null;
            const result = await api.startEnrolment(password, code);
            if (result.kind === 'enrolment') state.enrolment = result.enrolment;
            else state.error = result.failure;
        });

    const confirm = (code: string): Promise<void> =>
        guarded(async () => {
            const result = await api.confirm(normalizeCode(code));
            if (result.kind === 'status') {
                state.status = result.status;
                state.enrolment = null;
                state.justEnabled = true;
            } else if (result.failure === 'ENROLMENT_EXPIRED') {
                state.enrolment = null;
                state.error = result.failure;
            } else {
                state.error = result.failure;
            }
        });

    function cancel(): void {
        state.enrolment = null;
        state.error = null;
    }

    return { ...toRefs(state), load, begin, confirm, cancel };
}
