import type en from '../en/settingsAccess';

const settingsAccess: typeof en = {
    breadcrumb: 'Рабочее пространство / Настройки системы',
    notAuthorized: 'Нет доступа',
    scopeKinds: { own: 'Свои', department: 'Подразделение', all: 'Все' },
    scopeResources: {
        counterparty: 'Видимость контрагентов',
        order: 'Видимость заказов',
        teamVisibility: 'Видимость имён в справочнике команды',
    },
    permissionCategories: {
        orders: 'Заказы',
        catalog: 'Каталог',
        settlements: 'Взаиморасчёты',
        customers: 'Клиенты и контрагенты',
        pricing: 'Цены и скидки',
        admin: 'Администрирование и аудит',
    },
    roles: {
        title: 'Роли и доступ',
        panel: 'Роли',
        empty: 'Нет ролей, доступных вашей учётной записи.',
        denied: 'У вас нет прав на управление ролями и доступом.',
        loadFailed: 'Не удалось загрузить роли',
    },
    roleDetail: {
        crumb: 'Настройки / Роли',
        notFound: 'Роль не найдена',
        notVisible: 'Роль недоступна вашей учётной записи',
        loadFailed: 'Не удалось загрузить роль',
        back: 'К списку ролей',
        scope: 'Область доступа',
        credit: 'Лимит отсрочки платежа',
        permissions: 'Права',
        maxExtraDays: 'Макс. дополнительных дней',
        maxAmount: 'Макс. сумма (необязательно)',
        saveChanges: 'Сохранить изменения',
        saved: {
            permissions: 'Права сохранены.',
            scope: 'Область доступа сохранена.',
            credit: 'Лимит отсрочки сохранён.',
        },
        failed: {
            permissions: 'Не удалось сохранить права: {message}',
            scope: 'Не удалось сохранить область доступа: {message}',
            credit: 'Не удалось сохранить лимит отсрочки: {message}',
        },
    },
};

export default settingsAccess;
