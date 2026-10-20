import type { Ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { toast } from '@mivend/ui-kit';
import { useRepeatOrder, type RepeatableLine } from './useRepeatOrder';

export function useRepeatOrderAction(): {
    repeating: Ref<boolean>;
    repeatOrder: (lines: RepeatableLine[]) => Promise<void>;
} {
    const { t } = useI18n();
    const { repeating, repeat } = useRepeatOrder();

    async function repeatOrder(lines: RepeatableLine[]): Promise<void> {
        const { added, skipped, roundedUp } = await repeat(lines);
        if (added) toast(t('orders.detail.repeatDone', { added }), 'success');
        if (skipped) toast(t('orders.detail.repeatSkipped', { skipped }), 'error');
        if (roundedUp) toast(t('orders.detail.repeatRounded', { rounded: roundedUp }), 'info');
    }

    return { repeating, repeatOrder };
}
