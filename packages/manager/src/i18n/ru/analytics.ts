import type en from '../en/analytics';

import reports from './analyticsReports';

const analytics: typeof en = {
    reports,
    areas: {
        sales: 'Продажи',
        customers: 'Клиенты',
        receivables: 'Дебиторка',
        managers: 'Менеджеры',
    },
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
        notSpecified: 'Не указано',
        total: 'Итого',
        period: 'Период',
        granularity: 'Группировать по периоду',
        dimension: 'Разрез',
        granularities: { NONE: 'Без группировки', DAY: 'По дням', MONTH: 'По месяцам' },
        dimensions: {
            NONE: 'Без разреза (один итог)',
            CUSTOMER: 'Клиент',
            MANAGER: 'Менеджер заказа',
            POINT_OF_SALE: 'Торговая точка',
            ORGANIZATION: 'Организация',
            COUNTERPARTY_MANAGER: 'Менеджер клиента',
        },
        columns: {
            title: 'Название',
            period: 'Период',
            orderCount: 'Заказов',
            turnover: 'С НДС',
            turnoverExcludingVat: 'Без НДС',
            vatTotal: 'НДС',
            ordersWithoutAmount: 'Заказов без суммы',
            productQuantity: 'Количество',
            productAmount: 'Сумма строк',
            productLinesWithoutAmount: 'Строк без суммы',
        },
        filters: {
            customer: 'Клиент',
            organization: 'Организация',
            pointOfSale: 'Торговая точка',
            manager: 'Менеджер заказа',
            counterpartyManager: 'Менеджер клиента',
            product: 'Товар',
            manufacturer: 'Производитель',
        },
        mainManagerOnly: 'Только главный менеджер',
        productBasis:
            'Фильтр по товару или производителю считает подходящие строки заказов: заказов столько, в скольких есть такая строка, а сумма — это сумма этих строк, а не всего заказа.',
        counterpartyManagerBasis:
            'Клиент с несколькими менеджерами учитывается у каждого из них, поэтому строки нельзя складывать.',
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
