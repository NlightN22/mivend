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
import { METHOD_CODE_BY_FORM, placementMetadata, proformaTabIds } from '../utils/checkoutPolicy';

// Cash and bank transfer settle as an obligation at placement; card is paid on the payment page.
export function useOrderPlacement(): { place: () => Promise<void> } {
    const cartStore = useCartStore();
    const checkoutStore = useCheckoutStore();
    const router = useRouter();

    async function openProformaTabs(form: PaymentForm, orderCode: string): Promise<void> {
        if (form !== 'bank-transfer') return;
        const { myProformaInvoices } = await shopApi(OrderProformaInvoicesDocument, { orderCode });
        for (const id of proformaTabIds(form, myProformaInvoices.items)) {
            const href = router.resolve({
                path: `/proforma-invoices/${id}`,
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
