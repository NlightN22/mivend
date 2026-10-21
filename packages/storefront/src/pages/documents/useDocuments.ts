import { ref, type Ref } from 'vue';
import { i18n } from '../../i18n';
import { formatDate, formatMoney } from '../../i18n/format';
import { shopApi } from '../../api/client';
import { MyDocumentsDocument, type MyDocumentsQuery } from '../../api/generated/graphql';
import type { DocData } from './DocumentRow.vue';

export type DocumentSummary = MyDocumentsQuery['myDocuments']['items'][number];

export interface MyDocumentsOptions {
    take: number;
    skip: number;
    type?: string;
    search?: string;
}

function downloadUrlOf(doc: DocumentSummary): string | null {
    return doc.fileUrl ?? doc.pdfUrl ?? null;
}

export const DOCUMENT_TYPES = ['proforma-invoice', 'contract', 'return', 'reconciliation'];

function labelOr(key: string, fallback: string): string {
    return i18n.global.te(key) ? i18n.global.t(key) : fallback;
}

export function documentTypeLabel(type: string): string {
    return labelOr(`documents.type.${type}`, type);
}

const DOCUMENT_TYPE_ICON: Record<string, { icon: string; iconVariant: DocData['iconVariant'] }> = {
    'proforma-invoice': { icon: '₽', iconVariant: 'orange' },
    contract: { icon: '📄', iconVariant: 'blue' },
    return: { icon: '↩', iconVariant: 'green' },
    reconciliation: { icon: '🧾', iconVariant: 'blue' },
};

const DOCUMENT_STATUS_VARIANT: Record<string, DocData['statusVariant']> = {
    pending: 'muted',
    generating: 'muted',
    ready: 'green',
    failed: 'warning',
};

export function toDocData(doc: DocumentSummary): DocData {
    const { icon, iconVariant } = DOCUMENT_TYPE_ICON[doc.type] ?? {
        icon: '📄',
        iconVariant: 'blue' as const,
    };
    const date = formatDate(doc.issueDate, {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    });
    const amount =
        doc.amount != null ? formatMoney(doc.amount / 100, doc.currencyCode ?? null) : '—';
    const downloadUrl = downloadUrlOf(doc);
    return {
        icon,
        iconVariant,
        name: `${documentTypeLabel(doc.type)} ${doc.number}`,
        meta: doc.orderId
            ? i18n.global.t('documents.row.orderRef', { id: doc.orderId })
            : documentTypeLabel(doc.type),
        date,
        amount,
        statusLabel: labelOr(`documents.status.${doc.status}`, doc.status),
        statusVariant: DOCUMENT_STATUS_VARIANT[doc.status] ?? 'muted',
        actions: downloadUrl ? ['download'] : [],
        downloadUrl,
    };
}

export function useDocuments(): {
    documents: Ref<DocumentSummary[]>;
    totalItems: Ref<number>;
    loading: Ref<boolean>;
    error: Ref<unknown>;
    load: (options: MyDocumentsOptions) => Promise<void>;
} {
    const documents = ref<DocumentSummary[]>([]);
    const totalItems = ref(0);
    const loading = ref(false);
    const error = ref<unknown>(null);

    async function load(options: MyDocumentsOptions): Promise<void> {
        loading.value = true;
        error.value = null;
        try {
            const result = await shopApi(MyDocumentsDocument, { options });
            documents.value = result.myDocuments.items;
            totalItems.value = result.myDocuments.totalItems;
        } catch (e) {
            error.value = e;
            console.error('[useDocuments]', e);
        } finally {
            loading.value = false;
        }
    }

    return { documents, totalItems, loading, error, load };
}
