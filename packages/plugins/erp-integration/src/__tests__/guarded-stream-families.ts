import { VERSION_GUARDED_STREAMS } from '../reconciled-streams';
import type { InboundStream } from '../types';

// Which replay test proves the target's version guard; a stream added to VERSION_GUARDED_STREAMS needs a row here.
export type GuardFamily =
    | 'document-writer'
    | 'settlement-document'
    | 'setup-document'
    | 'granted'
    | 'order-event';

export const GUARD_FAMILY: Record<string, GuardFamily> = {
    'goods-and-services-sale': 'document-writer',
    'customer-goods-return': 'document-writer',
    'customer-order-closing': 'document-writer',
    'customer-proforma-invoice': 'document-writer',
    'issued-vat-invoice': 'document-writer',
    'incoming-payment-order': 'document-writer',
    'cash-receipt-order': 'document-writer',
    'customer-card-payment': 'document-writer',
    'debt-correction': 'document-writer',
    'warehouse-order': 'document-writer',
    'tl-warehouse-work-result': 'document-writer',
    'customer-claim': 'document-writer',
    'sales-correction': 'document-writer',
    'order-correction': 'document-writer',
    'settlement-document': 'settlement-document',
    'discount-setup': 'setup-document',
    'retro-bonus-setup': 'setup-document',
    'granted-discount': 'granted',
    'granted-retro-bonus': 'granted',
    'order-changed': 'order-event',
    'order-state': 'order-event',
};

export function streamsOf(family: GuardFamily): InboundStream[] {
    return VERSION_GUARDED_STREAMS.filter(stream => GUARD_FAMILY[stream] === family);
}
