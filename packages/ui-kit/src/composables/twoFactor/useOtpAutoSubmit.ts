import { ref, watch, type Ref } from 'vue';
import { isCompleteCode } from './twoFactorTypes';

export interface OtpAutoSubmitState {
    loading: () => boolean;
    failed: () => boolean;
}

export function useOtpAutoSubmit(
    submit: (code: string) => void,
    state: OtpAutoSubmitState,
    onReset: () => void = () => undefined,
): { code: Ref<string>; trigger: () => void } {
    const code = ref('');
    let sent: string | null = null;

    function trigger(): void {
        if (state.loading() || !isCompleteCode(code.value) || sent === code.value) return;
        sent = code.value;
        submit(code.value);
    }

    watch(code, (value, previous) => {
        if (value !== sent) sent = null;
        if (isCompleteCode(value) && !isCompleteCode(previous)) trigger();
    });

    watch(state.loading, (now, was) => {
        if (!was || now) return;
        if (sent === null || !state.failed()) return trigger();
        code.value = '';
        sent = null;
        onReset();
    });

    return { code, trigger };
}
