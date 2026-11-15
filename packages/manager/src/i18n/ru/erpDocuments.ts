import type en from '../en/erpDocuments';

const erpDocuments: typeof en = {
    page: {
        breadcrumb: 'Рабочее пространство / Документы',
    },
    customerClaim: { title: 'Рекламации клиентов' },
    salesCorrection: { title: 'Корректировки реализации' },
    orderCorrection: { title: 'Корректировки заказов' },
    powerOfAttorney: {
        title: 'Доверенности',
        unlimited: 'Без срока',
        contractDeleted: 'Договор удалён',
        scanPresent: 'Скан есть',
        scanMissing: 'Скана нет',
        status: { active: 'Действует', expired: 'Истекла' },
        list: {
            searchPlaceholder: 'Номер, доверенное лицо или клиент…',
            empty: 'Нет доверенностей, подходящих под фильтры',
            loadFailedTitle: 'Не удалось загрузить доверенности',
        },
        columns: {
            number: 'Номер',
            holder: 'Доверенное лицо',
            validFrom: 'Действует с',
            validUntil: 'Действует до',
            status: 'Статус',
            customer: 'Клиент',
            contract: 'Договор',
            scan: 'Скан',
        },
    },
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
