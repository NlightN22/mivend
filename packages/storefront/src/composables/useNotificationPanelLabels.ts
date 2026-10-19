import { computed, type ComputedRef } from 'vue';
import { useI18n } from 'vue-i18n';
import type { NotificationPanelLabels } from '@mivend/ui-kit';

export function useNotificationPanelLabels(): ComputedRef<NotificationPanelLabels> {
    const { t } = useI18n();
    return computed(() => ({
        title: t('notifications.title'),
        close: t('notifications.panel.close'),
        loading: t('notifications.loading'),
        empty: t('notifications.panel.empty'),
        markRead: t('notifications.panel.markRead'),
        resolve: t('notifications.panel.resolve'),
        resolutionPlaceholder: t('notifications.panel.resolutionPlaceholder'),
        showAll: t('notifications.panel.showAll'),
        justNow: t('notifications.panel.justNow'),
        minutesAgo: n => t('notifications.panel.minutesAgo', { n }),
        hoursAgo: n => t('notifications.panel.hoursAgo', { n }),
        daysAgo: n => t('notifications.panel.daysAgo', { n }),
    }));
}
