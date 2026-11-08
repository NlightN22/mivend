import { reactive, toRefs } from 'vue';
import type { TwoFactorRecoveryApi, TwoFactorUiError } from './twoFactorTypes';

export type RecoveryView = 'form' | 'invalid' | 'done';

export function useTwoFactorRecovery(token: string, api: TwoFactorRecoveryApi) {
    const state = reactive<{
        view: RecoveryView;
        error: TwoFactorUiError | null;
        loading: boolean;
    }>({ view: token ? 'form' : 'invalid', error: null, loading: false });

    async function submit(password: string): Promise<void> {
        if (state.loading || !token || !password) return;
        state.loading = true;
        state.error = null;
        try {
            const result = await api.complete(token, password);
            if (result === 'ok') state.view = 'done';
            else if (result === 'RECOVERY_LINK_INVALID') state.view = 'invalid';
            else state.error = result;
        } catch {
            state.error = 'UNKNOWN';
        } finally {
            state.loading = false;
        }
    }

    return { ...toRefs(state), submit };
}
