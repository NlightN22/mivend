import { describe, expect, it } from 'vitest';

import { buildProformaPaymentQr } from '../../qr-payment/proforma-payment-qr';
import { abbreviateLegalName } from '../../qr-payment/legal-name-abbreviation';
import { DEFAULT_LEGAL_NAME_ABBREVIATIONS } from '../../qr-payment/default-legal-name-abbreviations';

const LEGAL_NAME = 'Общество с ограниченной ответственностью "Организация А"';

function source(recipientName: string): Parameters<typeof buildProformaPaymentQr>[0] {
    return {
        documentNumber: '0010001679-03-1',
        issueDate: new Date('2026-11-10T10:00:00.000Z'),
        amountKopecks: 80709,
        vatKopecks: 13452,
        recipientName,
        account: '40702810800330000952',
        bankName: 'ФИЛИАЛ АО АИКБ "БАНК-ПРИМЕР ОБЪЕД.БАНК"',
        bik: '040407853',
        correspondentAccount: '30101810700000000853',
        inn: '2465184820',
        kpp: '246001001',
    };
}

describe('proforma payment QR with a long seller name', () => {
    it('is dropped over 300 characters with the full legal-form phrase', () => {
        const result = buildProformaPaymentQr(source(LEGAL_NAME));
        expect(result.payload).toBeNull();
        expect(result.problems.join(' ')).toMatch(/300/);
    });

    it('is built once the legal-form phrase is abbreviated', () => {
        const name = abbreviateLegalName(LEGAL_NAME, DEFAULT_LEGAL_NAME_ABBREVIATIONS);
        const result = buildProformaPaymentQr(source(name));
        expect(result.problems).toEqual([]);
        expect(result.payload?.length).toBeLessThanOrEqual(300);
        expect(result.payload).toContain('ST00012|Name=ООО "Организация А"|');
    });
});
