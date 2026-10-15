import {
    IconAdjustments,
    IconCash,
    IconFileInvoice,
    IconFilePencil,
    IconRotate2,
    IconScale,
    IconFileText,
    IconGift,
    IconShoppingCart,
} from '@tabler/icons-vue';
import type { StatusBadgeVariant } from '../MvStatusBadge/MvStatusBadge.vue';

// Document.type is free-text ERP data: this map is presentation-only, never gates logic.
// Keys are only values the app really produces; add new ones only once they appear in data.
export interface DocumentTypeStyle {
    icon: typeof IconFileText;
    variant: StatusBadgeVariant;
    label?: string;
}

const STYLES: Record<string, DocumentTypeStyle> = {
    'proforma-invoice': { icon: IconFileInvoice, variant: 'info', label: 'Proforma invoice' },
    contract: { icon: IconFilePencil, variant: 'warning' },
    return: { icon: IconRotate2, variant: 'danger', label: 'Return' },
    reconciliation: { icon: IconScale, variant: 'success' },
    sale: { icon: IconShoppingCart, variant: 'success', label: 'Sale' },
    payment: { icon: IconCash, variant: 'info', label: 'Payment' },
    correction: { icon: IconAdjustments, variant: 'warning', label: 'Correction' },
    bonus: { icon: IconGift, variant: 'success', label: 'Bonus' },
};

// Distinct from every real variant above, so an unrecognized future type never looks like an
// existing one at a glance.
export const DEFAULT_DOCUMENT_TYPE_STYLE: DocumentTypeStyle = {
    icon: IconFileText,
    variant: 'neutral',
};

export function resolveDocumentTypeStyle(type: string): DocumentTypeStyle {
    return STYLES[type.trim().toLowerCase()] ?? DEFAULT_DOCUMENT_TYPE_STYLE;
}
