import type en from '../en/settingsPanels';

const settingsPanels: typeof en = {
    priceTypeGaps: {
        columns: {
            counterparty: 'Контрагент',
            taxId: 'ИНН',
            reason: 'Причина',
            mainContract: 'Основной договор',
        },
        filterPlaceholder: 'Название или ИНН содержит…',
        searchPlaceholder: 'Поиск контрагентов…',
        empty: 'У всех контрагентов определён тип цены',
        reasons: {
            'no-main-contract': 'Нет основного договора в ERP',
            'contract-not-found': 'Основной договор не получен из ERP',
            'contract-inactive': 'Основной договор неактивен в ERP',
            'price-type-not-synced': 'Тип цены договора не получен из ERP',
        },
    },
    orderCheckHealth: {
        loadFailed: 'Не удалось загрузить счётчики требований ERP',
        empty: 'Сейчас нет заказов, не прошедших требования ERP.',
        orders: '{count} заказ | {count} заказа | {count} заказов',
        outOfDate: '{count} устарело',
    },
    erpReconciliation: {
        run: 'Запустить сверку сейчас',
        summary: 'Проверено {checked}, найдено {found}',
        summarySkipped: 'Проверено {checked}, найдено {found} (пропущено: {skipped})',
        runFailed: 'Не удалось выполнить сверку',
        empty: 'Нет открытых расхождений с ERP',
        detected: '{message} · обнаружено {date}',
    },
};

export default settingsPanels;
