import { CompleteOrganizationRequisites } from '../entities/organization-requisites.entity';
import { lineDiscountTotal, lineNetAmount } from '@mivend/plugin-acquiring';
import { dateInWords, formatMoneyRu, rublesInWords } from './russian-words';

export const PAYMENT_NOTICE =
    'Внимание! Оплата данного счета означает согласие с условиями поставки товара. ' +
    'Уведомление об оплате обязательно, в противном случае не гарантируется наличие товара на складе. ' +
    'Товар отпускается по факту прихода денег на р/с поставщика.';

export interface ProformaInvoiceSourceLine {
    quantity: number;
    unitPriceWithTax: number;
    linePriceWithTax: number;
    discounts: { amount: number }[];
    unitName: string | null;
    productVariant: { name: string; sku: string };
}

// One organization-split document (docs/payments.md "Organizations"), not the whole order.
export interface ProformaInvoiceSource {
    documentNumber: string;
    issueDate: Date;
    currencyCode: string | null;
    totalAmount: number;
    // Minor units; null when the snapshot carries no tax data — the VAT line is then omitted.
    vatAmount?: number | null;
    version: number;
    superseded: boolean;
    lines: ProformaInvoiceSourceLine[];
}

export interface Signer {
    name: string | null;
    title: string | null;
}

export interface PartyInput {
    name: string;
    inn: string | null;
    kpp: string | null;
    address: string | null;
    phone: string | null;
}

export interface ProformaInvoiceRow {
    index: number;
    sku: string;
    name: string;
    quantity: string;
    unit: string;
    price: string;
    gross: string;
    discount: string;
    total: string;
}

export interface ProformaInvoiceTemplateData {
    notice: string;
    bank: {
        bankName: string;
        bik: string;
        correspondentAccount: string | null;
        inn: string;
        kpp: string | null;
        account: string;
        recipientName: string;
    };
    title: string;
    versionLabel: string | null;
    superseded: boolean;
    supplier: string;
    buyer: string;
    rows: ProformaInvoiceRow[];
    showDiscount: boolean;
    totals: {
        subtotal: string;
        discount: string;
        vat: string | null;
        payable: string;
        summary: string;
        inWords: string | null;
    };
    signatory: Signer;
    chiefAccountant: Signer;
}

export function partyLine(party: PartyInput): string {
    return [
        party.name,
        party.inn ? `ИНН ${party.inn}` : null,
        party.kpp ? `КПП ${party.kpp}` : null,
        party.address,
        party.phone ? `тел.: ${party.phone}` : null,
    ]
        .filter(Boolean)
        .join(', ');
}

export function sellerParty(requisites: CompleteOrganizationRequisites): PartyInput {
    return {
        name: requisites.legalName,
        inn: requisites.inn,
        kpp: requisites.kpp,
        address: requisites.legalAddress,
        phone: requisites.phone,
    };
}

const HEAD_ROLE = 'Руководитель';
const CHIEF_ACCOUNTANT_ROLE = 'ГлавныйБухгалтер';

function signerByRole(requisites: CompleteOrganizationRequisites, role: string): Signer {
    const found = requisites.signatories?.find(s => s.role === role && s.personName);
    return { name: found?.personName ?? null, title: found?.position ?? null };
}

function headSigner(requisites: CompleteOrganizationRequisites): Signer {
    const fromErp = signerByRole(requisites, HEAD_ROLE);
    if (fromErp.name) return fromErp;
    return { name: requisites.signatoryName, title: requisites.signatoryTitle };
}

function formatQuantity(quantity: number): string {
    return String(quantity).replace('.', ',');
}

// Stored amounts of older versions may predate net-of-discount totals: callers warn, the stored amount is printed.
export function printedRowsTotal(source: ProformaInvoiceSource): number {
    return source.lines.reduce((sum, line) => sum + lineNetAmount(line), 0);
}

export function buildProformaInvoiceTemplateData(
    source: ProformaInvoiceSource,
    requisites: CompleteOrganizationRequisites,
    buyer: PartyInput,
): ProformaInvoiceTemplateData {
    const supplier = sellerParty(requisites);
    const discounts = source.lines.map(line => lineDiscountTotal(line.discounts));
    const totalDiscount = discounts.reduce((sum, d) => sum + d, 0);
    const subtotal = source.lines.reduce((sum, line) => sum + line.linePriceWithTax, 0);
    const currency = source.currencyCode ?? '';

    return {
        notice: PAYMENT_NOTICE,
        bank: {
            bankName: requisites.bankName,
            bik: requisites.bankBik,
            correspondentAccount: requisites.correspondentAccount,
            inn: requisites.inn,
            kpp: requisites.kpp,
            account: requisites.bankAccount,
            recipientName: requisites.legalName,
        },
        title: `Счет на оплату № ${source.documentNumber} от ${dateInWords(source.issueDate)}`,
        versionLabel: source.version > 1 ? `Версия ${source.version}` : null,
        superseded: source.superseded,
        supplier: partyLine(supplier),
        buyer: partyLine(buyer),
        rows: source.lines.map((line, i) => ({
            index: i + 1,
            sku: line.productVariant.sku,
            name: line.productVariant.name,
            quantity: formatQuantity(line.quantity),
            unit: line.unitName ?? '',
            price: formatMoneyRu(line.unitPriceWithTax),
            gross: formatMoneyRu(line.linePriceWithTax),
            discount: formatMoneyRu(discounts[i]),
            total: formatMoneyRu(lineNetAmount(line)),
        })),
        showDiscount: totalDiscount > 0,
        totals: {
            subtotal: formatMoneyRu(subtotal),
            discount: formatMoneyRu(totalDiscount),
            vat: source.vatAmount == null ? null : formatMoneyRu(source.vatAmount),
            payable: formatMoneyRu(source.totalAmount),
            summary:
                `Всего наименований ${source.lines.length}, на сумму ${formatMoneyRu(source.totalAmount)} ${currency}`.trim(),
            inWords: currency === 'RUB' ? rublesInWords(source.totalAmount) : null,
        },
        signatory: headSigner(requisites),
        chiefAccountant: signerByRole(requisites, CHIEF_ACCOUNTANT_ROLE),
    };
}
