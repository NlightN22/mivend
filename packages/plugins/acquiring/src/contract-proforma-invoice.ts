import { UserInputError } from '@vendure/core';

import type { DefaultVatRate } from './default-vat-rate';
import type { ProformaInvoiceLineSnapshot } from './entities/proforma-invoice.entity';
import { extractVat } from './proforma-invoice-tax';

export type ContractProformaMode = 'debt-repayment' | 'advance';

export interface IssueContractProformaInvoiceInput {
    contractId: string;
    mode: ContractProformaMode;
    amount: number;
    idempotencyKey: string;
}

// GraphQL Int carries the amount in kopecks; this is the largest amount it can express.
export const MAX_CONTRACT_PROFORMA_AMOUNT = 2147483647;
const MODES: ContractProformaMode[] = ['debt-repayment', 'advance'];
const IDEMPOTENCY_KEY = /^[A-Za-z0-9-]{8,64}$/;

export function assertContractProformaInput(input: IssueContractProformaInvoiceInput): void {
    if (!MODES.includes(input.mode)) throw new UserInputError(`Unknown mode ${input.mode}`);
    if (!Number.isSafeInteger(input.amount) || input.amount <= 0) {
        throw new UserInputError('Amount must be a positive whole number of minor units');
    }
    if (input.amount > MAX_CONTRACT_PROFORMA_AMOUNT) {
        throw new UserInputError(
            `Amount must not exceed ${MAX_CONTRACT_PROFORMA_AMOUNT} minor units`,
        );
    }
    if (!IDEMPOTENCY_KEY.test(input.idempotencyKey)) {
        throw new UserInputError('Invalid idempotency key');
    }
}

// The single printed row, Russian like all proforma PDF text; the amount includes VAT at the default rate.
export function contractProformaLine(
    mode: ContractProformaMode,
    contractName: string,
    amount: number,
    vat: DefaultVatRate | null,
): ProformaInvoiceLineSnapshot {
    const name =
        mode === 'debt-repayment'
            ? `Погашение задолженности по договору ${contractName}`
            : `Аванс по договору ${contractName}`;
    return {
        variantId: 0,
        sku: '',
        name,
        quantity: 1,
        unitPriceWithTax: amount,
        linePriceWithTax: amount,
        discounts: [],
        ...(vat && {
            taxRate: vat.taxRate,
            taxCategoryName: vat.taxCategoryName,
            taxAmount: vat.taxRate === null ? 0 : extractVat(amount, vat.taxRate),
        }),
    };
}
