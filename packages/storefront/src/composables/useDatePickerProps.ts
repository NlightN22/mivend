import { computed, type ComputedRef } from 'vue';
import { useI18n } from 'vue-i18n';
import type { DatePickerLabels } from '@mivend/ui-kit';
import { regionalTag } from '../i18n/locales';

const A_SUNDAY = Date.UTC(2026, 0, 4);
const DAY_MS = 86_400_000;

export function useDatePickerProps(): ComputedRef<{ locale: string; labels: DatePickerLabels }> {
    const { t, locale } = useI18n();
    return computed(() => {
        const tag = regionalTag(locale.value);
        const weekday = new Intl.DateTimeFormat(tag, { weekday: 'short', timeZone: 'UTC' });
        return {
            locale: tag,
            labels: {
                placeholder: t('datePicker.placeholder'),
                invalidDate: t('datePicker.invalidDate'),
                previousMonth: t('datePicker.previousMonth'),
                nextMonth: t('datePicker.nextMonth'),
                clear: t('search.clear'),
                weekdays: Array.from({ length: 7 }, (_, i) =>
                    weekday.format(A_SUNDAY + i * DAY_MS),
                ),
            },
        };
    });
}
