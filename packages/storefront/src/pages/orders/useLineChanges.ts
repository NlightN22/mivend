import { computed, type ComputedRef } from 'vue';
import { useI18n } from 'vue-i18n';
import type { LineChangeViewEvent } from '@mivend/ui-kit';
import type { OrderDetail } from './useOrderDetail';

export interface LineChangeView {
    ordered: number;
    actual: number;
    events: LineChangeViewEvent[];
}

export function useLineChanges(order: () => OrderDetail): {
    hasChanges: ComputedRef<boolean>;
    changeOf: (lineId: string) => LineChangeView | undefined;
} {
    const { t, te } = useI18n();
    const known = (group: string, key: string): string =>
        te(`orders.detail.changes.${group}.${key}`) ? key : 'other';
    const byLine = computed(() => {
        const map = new Map<string, LineChangeView>();
        for (const change of order().lineChanges) {
            map.set(change.orderLineId, {
                ordered: change.ordered,
                actual: change.actual,
                events: change.events.map(e => ({
                    kind: e.kind,
                    title: t(`orders.detail.changes.kinds.${known('kinds', e.titleKey)}`),
                    subtitle: t(
                        `orders.detail.changes.subtitles.${known('subtitles', e.subtitleKey)}`,
                    ),
                    quantity: e.quantity,
                    remainder: e.remainder,
                    reference: t('orders.detail.changes.document', { number: e.documentNumber }),
                })),
            });
        }
        return map;
    });
    return {
        hasChanges: computed(() => byLine.value.size > 0),
        changeOf: lineId => byLine.value.get(lineId),
    };
}
