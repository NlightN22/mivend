import type en from '../en/erpDocuments';

const erpDocuments: typeof en = {
    page: {
        breadcrumb: 'Рабочее пространство / Документы',
    },
    customerClaim: { title: 'Рекламации клиентов' },
    salesCorrection: { title: 'Корректировки реализации' },
    orderCorrection: { title: 'Корректировки заказов' },
    link: 'Связанные документы ({count})',
    list: {
        searchPlaceholder: 'Номер, заказ или клиент…',
        empty: 'Нет документов, подходящих под фильтры',
        loadFailedTitle: 'Не удалось загрузить документы',
        loadFailedMessage: 'Проверьте соединение и повторите попытку.',
        showAll: 'Показать все документы',
        filteredToOrder: 'Показан один заказ.',
        filteredToCustomer: 'Показан один клиент.',
    },
    columns: {
        number: 'Номер',
        date: 'Дата',
        customer: 'Клиент',
        order: 'Заказ',
        products: 'Товары',
        contract: 'Договор',
        organization: 'Организация',
        comment: 'Комментарий',
        amount: 'Сумма',
    },
};

export default erpDocuments;
