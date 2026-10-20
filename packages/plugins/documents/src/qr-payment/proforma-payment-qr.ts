import { formatMoneyRu } from '../pdf/russian-words';
import { buildPaymentQrPayload } from './st00012';

export interface ProformaQrSource {
    documentNumber: string;
    issueDate: Date;
    amountKopecks: number;
    vatKopecks: number | null;
    recipientName: string;
    account: string;
    bankName: string;
    bik: string;
    correspondentAccount: string | null;
    inn: string;
    kpp: string | null;
    purpose?: string | null;
}

export interface ProformaPaymentQr {
    payload: string | null;
    problems: string[];
}

function formatDate(date: Date): string {
    const pad = (n: number): string => String(n).padStart(2, '0');
    return `${pad(date.getUTCDate())}.${pad(date.getUTCMonth() + 1)}.${date.getUTCFullYear()}`;
}

export function buildProformaPaymentQr(source: ProformaQrSource): ProformaPaymentQr {
    const vat =
        source.vatKopecks === null ? '' : `, в т.ч. НДС ${formatMoneyRu(source.vatKopecks)}`;
    const result = buildPaymentQrPayload({
        name: source.recipientName,
        personalAcc: source.account,
        bankName: source.bankName,
        bic: source.bik,
        correspAcc: source.correspondentAccount ?? '',
        sumKopecks: source.amountKopecks,
        purpose:
            source.purpose ??
            `Оплата по счету № ${source.documentNumber} от ${formatDate(source.issueDate)}${vat}`,
        payeeInn: source.inn,
        kpp: source.kpp,
    });
    return result.ok
        ? { payload: result.payload, problems: [] }
        : { payload: null, problems: result.errors };
}
