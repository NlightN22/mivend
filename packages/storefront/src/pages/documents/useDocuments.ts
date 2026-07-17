import { ref, type Ref } from 'vue';
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

// ERP-pushed documents (return/reconciliation) carry a direct fileUrl (1C
// already hosts the file). Self-generated documents (invoice/contract) carry
// `asset` instead, whose `source` is already a full absolute URL built by
// Vendure's own Asset resolver — never construct download URLs client-side.
function downloadUrlOf(doc: DocumentSummary): string | null {
    return doc.fileUrl ?? doc.asset?.source ?? null;
}

export const DOCUMENT_TYPE_LABEL: Record<string, string> = {
    invoice: 'Invoice',
    contract: 'Contract',
    return: 'Return',
    reconciliation: 'Reconciliation report',
};

const DOCUMENT_TYPE_ICON: Record<string, { icon: string; iconVariant: DocData['iconVariant'] }> = {
    invoice: { icon: '₽', iconVariant: 'orange' },
    contract: { icon: '📄', iconVariant: 'blue' },
    return: { icon: '↩', iconVariant: 'green' },
    reconciliation: { icon: '🧾', iconVariant: 'blue' },
};

const DOCUMENT_STATUS_LABEL: Record<string, string> = {
    pending: 'Preparing',
    generating: 'Generating',
    ready: 'Ready',
    failed: 'Failed',
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
    const date = new Date(doc.issueDate).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    });
    const amount =
        doc.amount != null
            ? new Intl.NumberFormat('en-GB').format(doc.amount / 100) +
              (doc.currencyCode ? ` ${doc.currencyCode}` : '')
            : '—';
    const downloadUrl = downloadUrlOf(doc);
    return {
        icon,
        iconVariant,
        name: `${DOCUMENT_TYPE_LABEL[doc.type] ?? doc.type} ${doc.number}`,
        meta: doc.orderId ? `Order #${doc.orderId}` : (DOCUMENT_TYPE_LABEL[doc.type] ?? doc.type),
        date,
        amount,
        statusLabel: DOCUMENT_STATUS_LABEL[doc.status] ?? doc.status,
        statusVariant: DOCUMENT_STATUS_VARIANT[doc.status] ?? 'muted',
        actions: downloadUrl ? ['download'] : [],
        downloadUrl,
    };
}

export function useDocuments(): {
    documents: Ref<DocumentSummary[]>;
    totalItems: Ref<number>;
    loading: Ref<boolean>;
    load: (options: MyDocumentsOptions) => Promise<void>;
} {
    const documents = ref<DocumentSummary[]>([]);
    const totalItems = ref(0);
    const loading = ref(false);

    async function load(options: MyDocumentsOptions): Promise<void> {
        loading.value = true;
        try {
            const result = await shopApi(MyDocumentsDocument, { options });
            documents.value = result.myDocuments.items;
            totalItems.value = result.myDocuments.totalItems;
        } catch (e) {
            console.error('[useDocuments]', e);
        } finally {
            loading.value = false;
        }
    }

    return { documents, totalItems, loading, load };
}
