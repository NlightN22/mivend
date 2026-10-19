import type { FilterChip } from '@mivend/ui-kit';
import { i18n } from '../../i18n';

const TYPE_CHIP_KEYS = ['all', 'sale', 'payment', 'return', 'correction', 'bonus'] as const;

export const PERIOD_PRESET_KEYS = [
    'all',
    'last30',
    'last90',
    'thisMonth',
    'prevMonth',
    'custom',
] as const;

export function typeChips(): FilterChip[] {
    const t = i18n.global.t;
    return [
        ...TYPE_CHIP_KEYS.map(key => ({ key, label: t(`settlements.chips.${key}`) })),
        { key: 'overdue', label: t('settlements.chips.overdue'), variant: 'danger' },
    ];
}

export function periodOptions(): { value: string; label: string }[] {
    return PERIOD_PRESET_KEYS.map(key => ({
        value: key,
        label: i18n.global.t(`settlements.period.${key}`),
    }));
}
