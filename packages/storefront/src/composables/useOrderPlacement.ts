import { useRouter } from 'vue-router';
import { toast } from '@mivend/ui-kit';
import type { PaymentForm } from 'shared';
import { shopApi } from '../api/client';
import {
    CompleteOrderPaymentDocument,
    OrderProformaInvoicesDocument,
} from '../api/generated/graphql';
import { useCartStore } from '../stores/cart';
import { useCheckoutStore } from '../stores/checkout';
import {
    METHOD_CODE_BY_FORM,
    placementMetadata,
    proformaDocumentUrl,
    proformaPrintTargets,
    type ProformaInvoiceRef,
} from '../utils/checkoutPolicy';

const PDF_POLL_ATTEMPTS = 3;
const PDF_POLL_INTERVAL_MS = 1000;

// Cash and bank transfer settle as an obligation at placement; card is paid on the payment page.
export function useOrderPlacement(): { place: () => Promise<void> } {
    const cartStore = useCartStore();
    const checkoutStore = useCheckoutStore();
    const router = useRouter();

    // The PDF is rendered by a background job: wait briefly for it, then fall back to the printable page.
    async function openProformaTabs(form: PaymentForm, orderCode: string): Promise<void> {
        if (form !== 'bank-transfer') return;
        let invoices: ProformaInvoiceRef[] = [];
        for (let attempt = 0; attempt < PDF_POLL_ATTEMPTS; attempt += 1) {
            const { myProformaInvoices } = await shopApi(OrderProformaInvoicesDocument, {
                orderCode,
            });
            invoices = myProformaInvoices.items;
            if (invoices.every(i => i.status === 'cancelled' || proformaDocumentUrl(i))) break;
            if (attempt < PDF_POLL_ATTEMPTS - 1) {
                await new Promise(resolve => setTimeout(resolve, PDF_POLL_INTERVAL_MS));
            }
        }
        for (const target of proformaPrintTargets(form, invoices)) {
            const href =
                target.kind === 'pdf'
                    ? target.url
                    : router.resolve({
                          path: `/proforma-invoices/${target.id}`,
                          query: { print: '1' },
                      }).href;
            window.open(href, '_blank');
        }
    }

    async function place(): Promise<void> {
        const form = checkoutStore.selectedPayment;
        if (!form || !(await cartStore.beginCheckout())) return;
        if (form === 'card') {
            await router.push('/payment-stub');
            return;
        }
        const result = await shopApi(CompleteOrderPaymentDocument, {
            method: METHOD_CODE_BY_FORM[form],
            metadata: placementMetadata(
                checkoutStore.acknowledgementRequired && checkoutStore.creditAcknowledged,
            ),
        });
        await cartStore.fetchCart();
        const payment = result.addPaymentToOrder;
        if (payment.__typename !== 'Order') {
            toast(payment.message ?? 'Could not place order', 'error');
            return;
        }
        // Popup blockers may drop these tabs; the order-created page lists the same links.
        await openProformaTabs(form, payment.code).catch(() => undefined);
        await router.push({ path: '/order-created', query: { code: payment.code } });
    }

    return { place };
}
