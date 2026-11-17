import { i18n } from '../../i18n';

const t = (key: string, named?: Record<string, unknown>): string => i18n.global.t(key, named ?? {});

// Null when neither period has sales; "no earlier sales" when only the earlier one is empty.
export function deltaText(
    current: number,
    previous: number,
    key: 'vsPrevious' | 'vsPrevMonth' | 'vsPrevYear',
): string | null {
    if (previous === 0) return current === 0 ? null : t('managerCard.kpi.none');
    const percent = Math.round(((current - previous) / Math.abs(previous)) * 100);
    return t(`managerCard.kpi.${key}`, { percent: `${percent > 0 ? '+' : ''}${percent}%` });
}

export const sharePercent = (part: number, whole: number): string =>
    `${whole > 0 ? Math.round((part / whole) * 100) : 0}%`;
