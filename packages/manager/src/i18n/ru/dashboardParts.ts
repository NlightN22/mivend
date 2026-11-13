import type en from '../en/dashboardParts';

const dashboardParts: typeof en = {
    approvalStatus: {
        empty: 'Отправленных заявок пока нет',
        requestType: {
            priceAdjustmentApproval: 'Заявка на корректировку цены',
            discountGrantApproval: 'Заявка на скидку',
            creditTermApproval: 'Заявка на срок оплаты',
        },
        waitingOn: 'Ожидает: {role}',
        pending: 'На рассмотрении',
        approved: 'Согласована',
        rejected: 'Отклонена',
    },
};

export default dashboardParts;
