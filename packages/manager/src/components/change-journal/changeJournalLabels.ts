export const CHANGE_JOURNAL_LABELS = {
    tab: 'Журнал изменений',
    pageTitle: 'Журнал изменений',
    pageSubtitle: 'Кто, когда и что изменил в данных портала.',
    loading: 'Загрузка истории…',
    empty: 'Изменений пока нет',
    errorTitle: 'Не удалось загрузить историю',
    errorForbidden: 'Нет прав на эту историю.',
    retry: 'Повторить',
    redacted: 'изменено, значение скрыто',
    emptyValue: '—',
    noFields: 'Без изменённых полей',
    field: 'Поле',
    before: 'Было',
    after: 'Стало',
    previous: 'Назад',
    next: 'Вперёд',
    summary: (start: number, end: number, total: number): string => `${start}–${end} из ${total}`,
    pageOf: (page: number, count: number): string => `Страница ${page} из ${count}`,
    filterEntityType: 'Тип объекта',
    filterActorType: 'Кто изменил',
    filterUser: 'ID пользователя',
    filterAdministrator: 'Администратор',
    filterFrom: 'С даты',
    filterTo: 'По дату',
    anyOption: 'Все',
    resetFilters: 'Сбросить фильтры',
    entity: 'Объект',
} as const;

export const ACTOR_TYPE_LABELS: Record<string, string> = {
    administrator: 'Администратор',
    customer: 'Клиент',
    acting: 'Менеджер от имени клиента',
    system: 'Система',
};

export const ACTION_LABELS: Record<string, string> = {
    insert: 'Создание',
    update: 'Изменение',
    'soft-remove': 'Удаление в архив',
    recover: 'Восстановление',
    remove: 'Удаление',
};

export const ENTITY_TYPE_LABELS: Record<string, string> = {
    Counterparty: 'Контрагент',
    TradingPoint: 'Торговая точка',
    Customer: 'Профиль клиента',
    Administrator: 'Администратор',
    Order: 'Заказ',
    OrderLine: 'Строка заказа',
    User: 'Пользователь',
};

export const SOURCE_LABELS = {
    adminApi: 'Админ-API',
    shopApi: 'Витрина',
    rest: 'REST',
    scheduledTask: 'Плановая задача',
    background: 'Фоновая обработка',
} as const;
