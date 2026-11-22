import type en from '../en/analytics';

const analytics: typeof en = {
    title: 'Аналитика',
    status: { planned: 'Запланирован', available: 'Доступен' },
    catalog: {
        search: 'Поиск отчётов…',
        loadFailedTitle: 'Не удалось загрузить отчёты',
        loadFailedMessage: 'Проверьте соединение и попробуйте снова.',
        none: 'Для вашей роли нет доступных отчётов.',
        noMatch: 'Нет отчётов, подходящих под поиск.',
    },
    report: {
        back: 'Аналитика',
        notBuilt: 'Этот отчёт ещё не построен. Зарегистрировано только его описание.',
        notes: 'Заметки по реализации',
        notFound: 'Такого отчёта нет или он недоступен для вашей роли.',
    },
    orders: {
        searchPlaceholder: 'Поиск по названию…',
        total: 'Итого',
        period: 'Период',
        granularity: 'Группировать по периоду',
        dimension: 'Разрез',
        granularities: { NONE: 'Без группировки', DAY: 'По дням', MONTH: 'По месяцам' },
        dimensions: {
            NONE: 'Без разреза (один итог)',
            CUSTOMER: 'Клиент',
            MANAGER: 'Менеджер',
            POINT_OF_SALE: 'Торговая точка',
            ORGANIZATION: 'Организация',
        },
        columns: {
            title: 'Название',
            period: 'Период',
            orderCount: 'Заказов',
            turnover: 'С НДС',
            turnoverExcludingVat: 'Без НДС',
            vatTotal: 'НДС',
            ordersWithoutAmount: 'Заказов без суммы',
        },
        basis: 'Суммы заказов по данным интеграционного сервиса. Отменённые и удалённые заказы не учитываются; это не продажи.',
        limited: 'В расчёт входят только клиенты, которые вам доступны.',
        empty: 'За этот период заказов нет.',
        invalidPeriod: 'Дата окончания раньше даты начала.',
        loadFailedTitle: 'Не удалось загрузить заказы',
        loadFailedMessage: 'Проверьте соединение и попробуйте снова.',
        states: {
            NOT_CONFIGURED: 'Сервис аналитики на этом сервере не настроен.',
            TOO_LARGE:
                'В вашей выборке слишком много клиентов для расчёта. Сузьте её до одного клиента или менеджера.',
            UNAVAILABLE: 'Сервис аналитики сейчас недоступен. Попробуйте позже.',
        },
    },
};

export default analytics;
