import { i18n } from '../i18n';

const METHOD_KEYS: Record<string, string> = {
    cash: 'cash',
    'offline-terms': 'offlineTerms',
    'online-stub': 'onlineStub',
};

export function paymentMethodLabel(methodCode: string): string {
    const key = METHOD_KEYS[methodCode];
    return key ? i18n.global.t(`orderCreated.methods.${key}`) : methodCode;
}

export interface OrderCreatedText {
    status: string;
    steps: string[];
    waitingForCashConfirmation: boolean;
}

export function describeOrderCreated(code: string, methodCode: string): OrderCreatedText {
    const t = i18n.global.t;
    const created = t('orderCreated.created', { code });
    const notify = t('orderCreated.steps.notify');
    if (methodCode === 'cash') {
        return {
            status: t('orderCreated.status.cash', { created }),
            steps: [
                t('orderCreated.steps.cashHandOver'),
                t('orderCreated.steps.cashConfirm'),
                notify,
            ],
            waitingForCashConfirmation: true,
        };
    }
    if (methodCode === 'offline-terms') {
        return {
            status: t('orderCreated.status.offlineTerms', { created }),
            steps: [t('orderCreated.steps.bankPrint'), t('orderCreated.steps.bankMatch'), notify],
            waitingForCashConfirmation: false,
        };
    }
    return {
        status: t('orderCreated.status.default', { created }),
        steps: [t('orderCreated.steps.queued'), t('orderCreated.steps.reserved'), notify],
        waitingForCashConfirmation: false,
    };
}
