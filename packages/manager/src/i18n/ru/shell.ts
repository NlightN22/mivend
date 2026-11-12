import type en from '../en/shell';

const shell: typeof en = {
    nav: {
        dashboard: 'Обзор',
        customers: 'Клиенты',
        documents: 'Документы',
        orders: 'Заказы',
        proformaInvoices: 'Счета на оплату',
        discounts: 'Скидки',
        settlements: 'Взаиморасчёты',
        approvals: 'Согласования',
        team: 'Команда',
        bulkOperations: 'Массовые операции',
        analytics: 'Аналитика',
        systemSettings: 'Системные настройки',
        more: 'Ещё',
        workspace: 'Рабочее пространство',
    },
    topbar: {
        searchPlaceholder: 'Поиск клиентов, заказов, документов…',
    },
    userMenu: {
        account: 'Учётная запись',
        passwordAndSecurity: 'Пароль и безопасность',
        theme: 'Тема',
        themeLight: 'Светлая',
        themeDark: 'Тёмная',
        themeAuto: 'Авто',
        logout: 'Выйти',
    },
    layout: {
        defaultAccount: 'Вы вошли под стандартной учётной записью {name} со стандартным паролем.',
        changePassword: 'Сменить пароль',
    },
    search: {
        tooShort: 'Введите не менее 2 символов',
        pending: 'Идёт поиск…',
        failed: 'Поиск недоступен, попробуйте ещё раз',
        empty: 'Ничего не найдено',
        recent: 'Недавние запросы',
        clear: 'Очистить',
        remove: 'Удалить {query}',
        quickLinks: 'Быстрые ссылки',
        results: 'Результаты поиска',
        kind: {
            counterparty: 'Клиенты',
            order: 'Заказы',
            proformaInvoice: 'Счета на оплату',
            settlementDocument: 'Документы взаиморасчётов',
            discount: 'Скидки',
        },
        status: {
            active: 'Активен',
            inactive: 'Неактивен',
            current: 'Актуален',
            cancelled: 'Отменён',
            pending: 'Ожидает',
            rejected: 'Отклонена',
            approved: 'Одобрена',
            materialized: 'Применена',
        },
    },
    comingSoon: {
        title: 'Скоро',
        text: 'Этот раздел портала менеджера ещё не готов — он в планах.',
        newCustomer: 'Новый клиент',
        analytics: 'Аналитика',
        profile: 'Профиль',
    },
    notFound: {
        text: 'Такой страницы не существует.',
        back: 'Вернуться на обзор',
    },
};

export default shell;
