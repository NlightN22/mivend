import type en from '../en/settlements';

const settlements: typeof en = {
    page: {
        breadcrumb: 'Рабочее пространство / Взаиморасчёты',
        title: 'Взаиморасчёты',
        paymentsLink: 'Онлайн-платежи',
    },
    list: {
        searchPlaceholder: 'Номер, клиент или заказ…',
        empty: 'Нет документов, подходящих под фильтры',
        loadFailedTitle: 'Не удалось загрузить документы расчётов',
        loadFailedMessage: 'Проверьте соединение и попробуйте ещё раз.',
        droppedFilter: 'Неактуальный фильтр был удалён.',
        alsoOrders: 'Также заказы: {orders}',
        all: 'Все',
        showAllCustomers: 'Показать всех клиентов',
        filteredToCustomer: 'Показан один клиент.',
        filteredToCustomerNamed: 'Показан один клиент ({customer}).',
        columns: {
            number: 'Номер',
            date: 'Дата',
            type: 'Тип',
            customer: 'Клиент',
            contract: 'Договор',
            organization: 'Организация',
            order: 'Заказ',
            proformaInvoice: 'Счёт на оплату',
            amount: 'Сумма',
        },
    },
};

export default settlements;
