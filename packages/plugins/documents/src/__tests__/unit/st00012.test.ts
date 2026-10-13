import { describe, it, expect } from 'vitest';
import { buildPaymentQrPayload, type PaymentQrInput } from '../../qr-payment/st00012';
import {
    buildProformaPaymentQr,
    type ProformaQrSource,
} from '../../qr-payment/proforma-payment-qr';
import { renderQrSvg } from '../../qr-payment/qr-svg';

const valid: PaymentQrInput = {
    name: 'Example Supplier LLC',
    personalAcc: '40702000000000000000',
    bankName: 'Example Bank',
    bic: '044525000',
    correspAcc: '30101000000000000000',
    sumKopecks: 123456,
    purpose: 'Оплата по счету № 1000042-01 от 12.10.2026',
    payeeInn: '7700000000',
    kpp: '770001001',
};

function errorsOf(input: PaymentQrInput): string[] {
    const r = buildPaymentQrPayload(input);
    return r.ok ? [] : r.errors;
}

describe('buildPaymentQrPayload', () => {
    it('builds the ST00012 string with all fields in order', () => {
        const r = buildPaymentQrPayload(valid);
        expect(r).toEqual({
            ok: true,
            payload:
                'ST00012|Name=Example Supplier LLC|PersonalAcc=40702000000000000000|BankName=Example Bank|BIC=044525000|CorrespAcc=30101000000000000000|Sum=123456|Purpose=Оплата по счету № 1000042-01 от 12.10.2026|PayeeINN=7700000000|KPP=770001001',
        });
    });

    it('omits KPP when absent', () => {
        const r = buildPaymentQrPayload({ ...valid, kpp: null, payeeInn: '770000000000' });
        expect(r.ok && r.payload).not.toContain('KPP=');
        expect(r.ok && r.payload).toContain('PayeeINN=770000000000');
    });

    it.each([
        ['name', { name: '' }],
        ['personalAcc', { personalAcc: '' }],
        ['bankName', { bankName: ' ' }],
        ['bic', { bic: '' }],
        ['correspAcc', { correspAcc: '' }],
        ['purpose', { purpose: '' }],
        ['payeeInn', { payeeInn: '' }],
    ])('rejects missing %s', (field, patch) => {
        expect(errorsOf({ ...valid, ...patch })).toEqual([`${field}: missing`]);
    });

    it.each([0, -5, 1.5, Number.NaN])('rejects sum %s', sum => {
        expect(errorsOf({ ...valid, sumKopecks: sum })).toEqual([
            'sumKopecks: must be a positive integer',
        ]);
    });

    it('enforces length limits and digit formats', () => {
        expect(errorsOf({ ...valid, name: 'x'.repeat(161) })).toEqual(['name: longer than 160']);
        expect(errorsOf({ ...valid, bankName: 'x'.repeat(46) })).toEqual([
            'bankName: longer than 45',
        ]);
        expect(errorsOf({ ...valid, purpose: 'x'.repeat(211) })).toEqual([
            'purpose: longer than 210',
        ]);
        expect(errorsOf({ ...valid, personalAcc: '1234' })).toEqual([
            'personalAcc: invalid format',
        ]);
        expect(errorsOf({ ...valid, bic: '12345678' })).toEqual(['bic: invalid format']);
        expect(errorsOf({ ...valid, payeeInn: '12345678901' })).toEqual([
            'payeeInn: invalid format',
        ]);
        expect(errorsOf({ ...valid, kpp: '1234' })).toEqual(['kpp: invalid format']);
    });

    it('rejects a payload over the total limit', () => {
        const long = { ...valid, name: 'n'.repeat(160), purpose: 'p'.repeat(100) };
        expect(errorsOf(long)).toEqual(['payload: longer than 300']);
    });

    it('replaces the separator and control characters inside values', () => {
        const r = buildPaymentQrPayload({ ...valid, name: 'A|B\nC  D' });
        expect(r.ok && r.payload).toContain('Name=A B C D|PersonalAcc');
        expect(r.ok && r.payload.split('|')).toHaveLength(10);
    });
});

describe('buildProformaPaymentQr', () => {
    const source: ProformaQrSource = {
        documentNumber: '1000042-01',
        issueDate: new Date('2026-10-05T10:00:00Z'),
        amountKopecks: 25000,
        superseded: false,
        vatKopecks: 4166,
        recipientName: 'Example Supplier LLC',
        account: '40702000000000000000',
        bankName: 'Example Bank',
        bik: '044525000',
        correspondentAccount: '30101000000000000000',
        inn: '7700000000',
        kpp: null,
    };

    it('builds the purpose with date and VAT, sum in kopecks', () => {
        const qr = buildProformaPaymentQr(source);
        expect(qr.payload).toContain('Sum=25000|');
        expect(qr.payload).toContain(
            'Purpose=Оплата по счету № 1000042-01 от 05.10.2026, в т.ч. НДС 41,66|',
        );
    });

    it('leaves VAT out of the purpose when unknown', () => {
        expect(buildProformaPaymentQr({ ...source, vatKopecks: null }).payload).toContain(
            'от 05.10.2026|PayeeINN',
        );
    });

    it('reports missing values instead of a payload', () => {
        const qr = buildProformaPaymentQr({ ...source, correspondentAccount: null });
        expect(qr).toEqual({ payload: null, problems: ['correspAcc: missing'] });
    });

    it('never builds a QR for a superseded version', () => {
        expect(buildProformaPaymentQr({ ...source, superseded: true })).toEqual({
            payload: null,
            problems: [],
        });
    });
});

describe('renderQrSvg', () => {
    it('returns a self-contained svg', () => {
        const svg = renderQrSvg('ST00012|Name=x');
        expect(svg.startsWith('<svg')).toBe(true);
        expect(svg).toContain('viewBox=');
    });
});
