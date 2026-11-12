import type { TwoFactorLabels } from '@mivend/ui-kit';
import { i18n } from '../../i18n';
import en from '../../i18n/en/auth';

const { errors: errorKeys, ...flatKeys } = en.twoFactor;

function defineLazy(target: object, prefix: string, keys: object): void {
    for (const key of Object.keys(keys)) {
        Object.defineProperty(target, key, {
            enumerable: true,
            get: () => i18n.global.t(`${prefix}.${key}`),
        });
    }
}

// Getters resolve at render time so a language switch updates labels held in this module-level object.
const errors = {};
defineLazy(errors, 'auth.twoFactor.errors', errorKeys);
const labels = { errors };
defineLazy(labels, 'auth.twoFactor', flatKeys);

export const TWO_FACTOR_LABELS = labels as TwoFactorLabels;

export const recoveredNotice = (): string => i18n.global.t('auth.twoFactor.recovered');
