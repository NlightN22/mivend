import { i18n } from '../i18n';
import type { AgeUnits } from './exchangeHealthView';

export function ageUnits(): AgeUnits {
    const { t } = i18n.global;
    return {
        s: t('exchangeHealth.units.s'),
        min: t('exchangeHealth.units.min'),
        h: t('exchangeHealth.units.h'),
        d: t('exchangeHealth.units.d'),
    };
}

export function stateLabel(state: string): string {
    const { t, te } = i18n.global;
    const key = `exchangeHealth.states.${state}`;
    return te(key) ? t(key) : state;
}
