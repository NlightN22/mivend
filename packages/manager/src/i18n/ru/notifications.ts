import type en from '../en/notifications';

const notifications: typeof en = {
    page: { breadcrumb: 'Рабочее пространство', title: 'Уведомления' },
    views: { all: 'Все', unread: 'Непрочитанные', read: 'Прочитанные', resolved: 'Закрытые' },
    status: {
        any: 'Все статусы',
        unread: 'Не прочитано',
        read: 'Прочитано',
        resolved: 'Закрыто',
    },
    columns: {
        title: 'Уведомление',
        createdAt: 'Дата',
        status: 'Статус',
        sourceType: 'Источник',
        message: 'Сообщение',
    },
    table: {
        titleFilter: 'Заголовок содержит…',
        searchPlaceholder: 'Поиск уведомлений…',
        empty: 'Нет уведомлений по выбранным фильтрам',
    },
    actions: {
        markRead: 'Отметить прочитанным',
        resolve: 'Закрыть',
        resolutionNote: 'Комментарий к закрытию',
        confirm: 'ОК',
    },
    errors: {
        markReadFailed: 'Не удалось отметить уведомление прочитанным',
        resolveFailed: 'Не удалось закрыть уведомление',
    },
};

export default notifications;
