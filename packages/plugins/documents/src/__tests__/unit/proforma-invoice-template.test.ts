import { describe, it, expect } from 'vitest';
import {
    buildProformaInvoiceTemplateData,
    renderProformaInvoiceHtml,
    ProformaInvoiceSource,
} from '../../pdf/proforma-invoice-template';
import { printedRowsTotal, type PartyInput } from '../../pdf/proforma-invoice-data';
import type { CompleteOrganizationRequisites } from '../../entities/organization-requisites.entity';

function makeSource(overrides: Partial<ProformaInvoiceSource> = {}): ProformaInvoiceSource {
    return {
        documentNumber: '1000042-01',
        issueDate: new Date('2026-10-12T10:00:00.000Z'),
        currencyCode: 'RUB',
        totalAmount: 25000,
        dueDate: new Date('2026-10-15T10:00:00.000Z'),
        version: 1,
        kind: 'order-placed',
        salesInvoiceNumber: null,
        hasNewerVersion: false,
        lines: [
            {
                quantity: 2,
                unitPriceWithTax: 10000,
                linePriceWithTax: 20000,
                discounts: [],
                taxRate: 20,
                taxCategoryName: 'VAT20',
                taxAmount: 3333,
                unitName: 'шт.',
                productVariant: { name: 'Motor Oil 5W-30', sku: 'MOT-5W30-1L' },
            },
        ],
        ...overrides,
    };
}

function makeRequisites(
    overrides: Partial<CompleteOrganizationRequisites> = {},
): CompleteOrganizationRequisites {
    return {
        legalName: 'Example Supplier LLC',
        legalAddress: '1 Demo Ave',
        inn: '0000000000',
        kpp: '000000000',
        ogrn: null,
        bankName: 'Example Bank',
        bankAccount: '00000000000000000000',
        bankBik: '000000000',
        correspondentAccount: '11111111111111111111',
        signatoryName: null,
        signatoryTitle: null,
        phone: null,
        signatories: null,
        ...overrides,
    } as CompleteOrganizationRequisites;
}

const buyer: PartyInput = {
    name: 'Buyer "A&B" LLC',
    inn: null,
    kpp: null,
    address: null,
    phone: null,
};

function render(
    source = makeSource(),
    requisites = makeRequisites(),
    party: PartyInput = buyer,
): string {
    return renderProformaInvoiceHtml(buildProformaInvoiceTemplateData(source, requisites, party));
}

describe('buildProformaInvoiceTemplateData', () => {
    it('builds title, rows and totals in Russian format', () => {
        const data = buildProformaInvoiceTemplateData(makeSource(), makeRequisites(), buyer);
        expect(data.title).toBe('Счет на оплату № 1000042-01 от 12 октября 2026 г.');
        expect(data.rows[0]).toMatchObject({
            index: 1,
            sku: 'MOT-5W30-1L',
            quantity: '2',
            unit: 'шт.',
            price: '100,00',
            total: '200,00',
        });
        expect(data.totals.payable).toBe('250,00');
        expect(data.totals.summary).toBe('Всего наименований 1, на сумму 250,00 RUB');
        expect(data.totals.inWords).toBe('Двести пятьдесят рублей 00 копеек');
    });

    it('prints party fields only when present', () => {
        const data = buildProformaInvoiceTemplateData(
            makeSource(),
            makeRequisites({ kpp: null, legalAddress: null }),
            { ...buyer, inn: '1', phone: '+0 000' },
        );
        expect(data.supplier).toBe('Example Supplier LLC, ИНН 0000000000');
        expect(data.buyer).toBe('Buyer "A&B" LLC, ИНН 1, тел.: +0 000');
    });

    it('printedRowsTotal sums the same net row amounts the rows print', () => {
        const source = makeSource();
        source.lines[0].discounts = [{ amount: -1500 }, { amount: -500 }];
        expect(printedRowsTotal(source)).toBe(
            source.lines.reduce((sum, l, i) => sum + l.linePriceWithTax - (i === 0 ? 2000 : 0), 0),
        );
    });

    it('computes discounts per line and shows the columns only when a discount exists', () => {
        const none = buildProformaInvoiceTemplateData(makeSource(), makeRequisites(), buyer);
        expect(none.showDiscount).toBe(false);
        const source = makeSource();
        source.lines[0].discounts = [{ amount: -1500 }];
        const data = buildProformaInvoiceTemplateData(source, makeRequisites(), buyer);
        expect(data.showDiscount).toBe(true);
        expect(data.rows[0]).toMatchObject({ gross: '200,00', discount: '15,00', total: '185,00' });
        expect(data.totals.discount).toBe('15,00');
    });

    it('shows the version only above 1 and a single summed VAT total', () => {
        expect(
            buildProformaInvoiceTemplateData(makeSource(), makeRequisites(), buyer),
        ).toMatchObject({
            versionLabel: null,
            totals: { vat: '33,33' },
        });
        expect(
            buildProformaInvoiceTemplateData(makeSource({ version: 3 }), makeRequisites(), buyer)
                .versionLabel,
        ).toBe('Версия 3');
    });

    it('sums mixed rates into one VAT total', () => {
        const base = makeSource().lines[0];
        const lines = [
            base,
            { ...base, taxRate: 10, taxAmount: 1818 },
            { ...base, taxRate: 0, taxAmount: 0 },
        ];
        const data = buildProformaInvoiceTemplateData(
            makeSource({ lines }),
            makeRequisites(),
            buyer,
        );
        expect(data.totals.vat).toBe('51,51');
        expect(render(makeSource({ lines })).match(/В том числе НДС/g)).toHaveLength(1);
    });

    it('prints "Без НДС" when every line is 0%', () => {
        const line = { ...makeSource().lines[0], taxRate: 0, taxAmount: 0 };
        const data = buildProformaInvoiceTemplateData(
            makeSource({ lines: [line] }),
            makeRequisites(),
            buyer,
        );
        expect(data.totals.vat).toBe('Без НДС');
    });

    it('fails when a rate is not confirmed', () => {
        const line = { ...makeSource().lines[0], taxRate: null, taxCategoryName: 'VAT10' };
        expect(() =>
            buildProformaInvoiceTemplateData(
                makeSource({ lines: [line] }),
                makeRequisites(),
                buyer,
            ),
        ).toThrow('VAT rate not confirmed for category VAT10');
    });

    it('prints "не указан" for snapshots without tax data', () => {
        const { taxRate, taxCategoryName, taxAmount, ...legacy } = makeSource().lines[0];
        void taxRate;
        void taxCategoryName;
        void taxAmount;
        const data = buildProformaInvoiceTemplateData(
            makeSource({ lines: [legacy] }),
            makeRequisites(),
            buyer,
        );
        expect(data.totals.vat).toBe('не указан');
    });

    it('skips the amount in words for non-RUB currencies', () => {
        const data = buildProformaInvoiceTemplateData(
            makeSource({ currencyCode: 'USD' }),
            makeRequisites(),
            buyer,
        );
        expect(data.totals.inWords).toBeNull();
    });
});

describe('renderProformaInvoiceHtml', () => {
    it('renders the bank block, QR placeholder, parties and signatures', () => {
        const html = render();
        expect(html).toContain('Example Bank');
        expect(html).toContain('Отсканируйте для оплаты');
        expect(html).toContain('КПП 000000000');
        expect(html).toContain('Поставщик:');
        expect(html).toContain('Грузополучатель:');
        expect(html).toContain('Главный (старший) бухгалтер');
        expect(html).not.toContain('Сумма без скидки');
        expect(html).toContain('В том числе НДС');
        expect(html).not.toContain('Версия');
        expect(html).not.toContain('Заменён');
    });

    it('escapes HTML in names', () => {
        expect(render()).toContain('Buyer &quot;A&amp;B&quot; LLC');
    });

    it('omits correspondent account and KPP when absent', () => {
        const html = render(
            makeSource(),
            makeRequisites({ kpp: null, correspondentAccount: null }),
        );
        expect(html).not.toContain('КПП');
        expect(html).not.toContain('11111111111111111111');
    });

    it('prints signatory name and title when present', () => {
        const html = render(
            makeSource(),
            makeRequisites({ signatoryName: 'Ivanov I. I.', signatoryTitle: 'Director' }),
        );
        expect(html).toContain('Ivanov I. I.');
        expect(html).toContain('Director');
    });

    it('prints the supplier phone only when present', () => {
        expect(render(makeSource(), makeRequisites({ phone: '+0 000 000' }))).toContain(
            'тел.: +0 000 000',
        );
        expect(render()).not.toContain('тел.:');
    });

    it('fills head and chief accountant lines from signatories, ERP head wins over the fallback', () => {
        const html = render(
            makeSource(),
            makeRequisites({
                signatoryName: 'Fallback F. F.',
                signatories: [
                    {
                        role: 'Руководитель',
                        roleLabel: 'Head',
                        personName: 'Head H. H.',
                        position: 'CEO',
                    },
                    {
                        role: 'ГлавныйБухгалтер',
                        roleLabel: 'CA',
                        personName: 'Acc A. A.',
                        position: null,
                    },
                    {
                        role: 'Кассир',
                        roleLabel: 'Cashier',
                        personName: 'Cash C. C.',
                        position: null,
                    },
                ],
            }),
        );
        expect(html).toContain('Head H. H.');
        expect(html).toContain('CEO');
        expect(html).toContain('Acc A. A.');
        expect(html).not.toContain('Fallback F. F.');
        expect(html).not.toContain('Cash C. C.');
    });

    it('falls back to signatoryName/Title for the head when no head signatory exists', () => {
        const html = render(
            makeSource(),
            makeRequisites({
                signatoryName: 'Fallback F. F.',
                signatoryTitle: 'Director',
                signatories: [],
            }),
        );
        expect(html).toContain('Fallback F. F.');
        expect(html).toContain('Director');
    });

    it('shows the version line and VAT, and only a neutral note when a newer version exists', () => {
        const html = render(makeSource({ version: 2, hasNewerVersion: true }));
        expect(html).toContain('Версия 2');
        expect(html).toContain('Есть более новая версия');
        expect(html).not.toContain('не действителен');
        expect(html).toContain('В том числе НДС');
    });

    it('prints the due date under the title and the shipment basis when present', () => {
        const html = render(
            makeSource({ kind: 'by-shipment', salesInvoiceNumber: 'R-77', version: 3 }),
        );
        expect(html).toContain('Срок оплаты до 15 октября 2026 г.');
        expect(html).toContain('по отгрузке (реализация № R-77)');
        expect(render(makeSource({ dueDate: null }))).not.toContain('Срок оплаты');
    });

    it('renders discount columns only when a discount exists', () => {
        const source = makeSource();
        source.lines[0].discounts = [{ amount: -100 }];
        expect(render(source)).toContain('Скидка (наценка)');
    });
});
