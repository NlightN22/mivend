import { computed, type ComputedRef } from 'vue';
import { useI18n } from 'vue-i18n';
import type { TwoFactorLabels } from '@mivend/ui-kit';

const ERROR_KEYS = [
    'INVALID_CREDENTIALS',
    'CHALLENGE_INVALID',
    'INVALID_CODE',
    'PASSWORD_INVALID',
    'CODE_REQUIRED',
    'NOT_ENROLLED',
    'ENROLMENT_EXPIRED',
    'RECOVERY_LINK_INVALID',
    'UNKNOWN',
] as const;

export function useTwoFactorLabels(): ComputedRef<TwoFactorLabels> {
    const { t, messages, locale } = useI18n();
    return computed(() => {
        const flat = (messages.value[locale.value] as { twoFactor?: Record<string, unknown> })
            .twoFactor;
        const labels: Record<string, unknown> = {};
        for (const key of Object.keys(flat ?? {})) {
            if (key !== 'errors') labels[key] = t(`twoFactor.${key}`);
        }
        labels.errors = Object.fromEntries(
            ERROR_KEYS.map(code => [code, t(`twoFactor.errors.${code}`)]),
        );
        return labels as unknown as TwoFactorLabels;
    });
}
