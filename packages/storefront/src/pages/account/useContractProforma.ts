import { ref, type Ref } from 'vue';
import { shopApi } from '../../api/client';
import {
    ContractProformaDocumentDocument,
    IssueContractProformaInvoiceDocument,
} from '../../api/generated/graphql';
import type { ContractPayMode } from './contractPayment';

const PDF_POLL_TRIES = 20;
const PDF_POLL_MS = 1500;

// getRandomValues, not randomUUID: the portal may be served over plain http, where randomUUID is absent.
function newKey(): string {
    return Array.from(crypto.getRandomValues(new Uint8Array(16)), b =>
        b.toString(16).padStart(2, '0'),
    ).join('');
}

export interface IssuedProforma {
    id: string;
    number: string;
}

export function useContractProforma(): {
    issuing: Ref<boolean>;
    failed: Ref<boolean>;
    issued: Ref<IssuedProforma | null>;
    pdfUrl: Ref<string | null>;
    pdfPending: Ref<boolean>;
    issue: (contractId: string, mode: ContractPayMode, amount: number) => Promise<void>;
    reset: () => void;
} {
    const issuing = ref(false);
    const failed = ref(false);
    const issued = ref<IssuedProforma | null>(null);
    const pdfUrl = ref<string | null>(null);
    const pdfPending = ref(false);
    let idempotencyKey = newKey();

    function reset(): void {
        idempotencyKey = newKey();
        issued.value = null;
        pdfUrl.value = null;
        failed.value = false;
    }

    async function waitForPdf(id: string): Promise<void> {
        pdfPending.value = true;
        try {
            for (let i = 0; i < PDF_POLL_TRIES && issued.value?.id === id; i++) {
                const { proformaInvoice } = await shopApi(ContractProformaDocumentDocument, { id });
                const document = proformaInvoice?.document;
                if (document?.status === 'ready' && document.pdfUrl) {
                    pdfUrl.value = document.pdfUrl;
                    return;
                }
                if (document?.status === 'failed') return;
                await new Promise(resolve => setTimeout(resolve, PDF_POLL_MS));
            }
        } finally {
            pdfPending.value = false;
        }
    }

    async function issue(contractId: string, mode: ContractPayMode, amount: number): Promise<void> {
        if (issuing.value) return;
        issuing.value = true;
        failed.value = false;
        try {
            const result = await shopApi(IssueContractProformaInvoiceDocument, {
                input: { contractId, mode, amount, idempotencyKey },
            });
            issued.value = result.issueContractProformaInvoice;
            void waitForPdf(result.issueContractProformaInvoice.id);
        } catch (e) {
            console.error('[useContractProforma]', e);
            failed.value = true;
        } finally {
            issuing.value = false;
        }
    }

    return { issuing, failed, issued, pdfUrl, pdfPending, issue, reset };
}
