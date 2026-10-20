import { renderQrSvg } from '../qr-payment/qr-svg';
import type { ProformaInvoiceRow, ProformaInvoiceTemplateData } from './proforma-invoice-data';

export {
    buildProformaInvoiceTemplateData,
    type ProformaInvoiceSource,
    type ProformaInvoiceSourceLine,
    type ProformaInvoiceTemplateData,
} from './proforma-invoice-data';

function esc(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function logoInitial(legalName: string): string {
    return legalName.trim().charAt(0).toUpperCase() || '?';
}

// Used by contract-template.ts: a real base64-embedded logo when set, else an initial-letter badge.
export function renderLogoMarkup(legalName: string, logoDataUri: string | null): string {
    if (logoDataUri) {
        return `<img class="logo" src="${logoDataUri}" alt="${esc(legalName)} logo" />`;
    }
    return `<div class="logo logo--fallback">${logoInitial(legalName)}</div>`;
}

const STYLES = `
    @page { size: A4; margin: 10mm; }
    * { box-sizing: border-box; }
    body { font-family: 'DejaVu Sans', Arial, sans-serif; color: #000; margin: 0; font-size: 9.5px; line-height: 1.35; }
    .notice { text-align: center; margin: 0 0 8px; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    td, th { word-wrap: break-word; overflow-wrap: anywhere; vertical-align: top; }
    .bank td { border: 1px solid #000; padding: 3px 5px; }
    .bank .cap { font-size: 8px; color: #333; }
    .bank .qr { width: 32mm; text-align: center; }
    .qr-box { height: 26mm; }
    .qr-box svg { width: 26mm; height: 26mm; display: block; margin: 0 auto; }
    h1 { font-size: 15px; margin: 14px 0 4px; padding-bottom: 6px; border-bottom: 2px solid #000; }
    .version { font-size: 11px; margin: 0 0 4px; }
    .due, .newer { font-size: 11px; margin: 0 0 4px; }
    .newer { color: #555; }
    .parties td { padding: 3px 0; }
    .parties .role { width: 34mm; padding-right: 6px; }
    .parties .who { font-weight: 700; }
    .items { margin-top: 8px; }
    .items th, .items td { border: 1px solid #000; padding: 2px 4px; }
    .items th { text-align: center; font-weight: 700; }
    .items tr { page-break-inside: avoid; }
    .num { text-align: right; white-space: nowrap; }
    .center { text-align: center; }
    .keep { page-break-inside: avoid; break-inside: avoid; }
    .totals { margin-top: 6px; }
    .totals td { padding: 1px 4px; font-weight: 700; }
    .summary { margin-top: 8px; }
    .words { font-weight: 700; padding-bottom: 6px; border-bottom: 2px solid #000; }
    .sign { margin-top: 14px; }
    .sign td { padding: 0 4px; vertical-align: bottom; }
    .sign .role { font-weight: 700; width: 30%; }
    .line { border-top: 1px solid #000; font-size: 8px; text-align: center; padding-top: 1px; }
    .signed { text-align: center; font-weight: 700; min-height: 12px; }
`;

function renderBank(bank: ProformaInvoiceTemplateData['bank'], qrPayload: string | null): string {
    return `
    <table class="bank">
        <tr>
            <td rowspan="2" style="width:50%">${esc(bank.bankName)}<div class="cap">Банк получателя</div></td>
            <td style="width:9%">БИК</td><td>${esc(bank.bik)}</td>
            <td rowspan="4" class="qr"><div class="qr-box">${qrPayload ? renderQrSvg(qrPayload) : ''}</div><div class="cap">Отсканируйте для оплаты</div></td>
        </tr>
        <tr>${bank.correspondentAccount ? `<td>Сч. №</td><td>${esc(bank.correspondentAccount)}</td>` : '<td></td><td></td>'}</tr>
        <tr>
            <td>ИНН ${esc(bank.inn)}${bank.kpp ? ` &nbsp; КПП ${esc(bank.kpp)}` : ''}</td>
            <td rowspan="2">Сч. №</td><td rowspan="2">${esc(bank.account)}</td>
        </tr>
        <tr><td>${esc(bank.recipientName)}<div class="cap">Получатель</div></td></tr>
    </table>`;
}

function columnWidths(showDiscount: boolean): number[] {
    return showDiscount ? [4, 11, 27, 7, 5, 11, 12, 11, 12] : [5, 14, 41, 9, 7, 12, 12];
}

function renderCols(widths: number[]): string {
    return `<colgroup>${widths.map(w => `<col style="width:${w}%">`).join('')}</colgroup>`;
}

function renderItems(rows: ProformaInvoiceRow[], showDiscount: boolean): string {
    const widths = columnWidths(showDiscount);
    const heads = [
        '№',
        'Артикул',
        'Товары (работы, услуги)',
        'Кол-во',
        'Ед.',
        'Цена',
        ...(showDiscount ? ['Сумма без скидки', 'Скидка (наценка)'] : []),
        'Сумма',
    ];
    const head = heads.map(h => `<th>${h}</th>`).join('');
    const body = rows
        .map(
            r => `<tr>
            <td class="center">${r.index}</td><td>${esc(r.sku)}</td><td>${esc(r.name)}</td>
            <td class="num">${r.quantity}</td><td class="center">${esc(r.unit)}</td><td class="num">${r.price}</td>
            ${showDiscount ? `<td class="num">${r.gross}</td><td class="num">${r.discount}</td>` : ''}
            <td class="num">${r.total}</td></tr>`,
        )
        .join('');
    return `<table class="items">${renderCols(widths)}<thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function renderTotalRows(data: ProformaInvoiceTemplateData): string {
    const t = data.totals;
    const widths = columnWidths(data.showDiscount);
    const labelSpan = widths.length - (data.showDiscount ? 3 : 1);
    const row = (label: string, cells: string[]): string =>
        `<tr><td colspan="${labelSpan}" style="text-align:right">${label}</td>${cells
            .map(c => `<td class="num">${c}</td>`)
            .join('')}</tr>`;
    const span = (label: string, value: string): string =>
        row(label, data.showDiscount ? ['', '', value] : [value]);
    return [
        data.showDiscount
            ? row('Итого:', [t.subtotal, t.discount, t.payable])
            : span('Итого:', t.payable),
        span('В том числе НДС:', t.vat),
        span('Всего к оплате:', t.payable),
    ].join('');
}

function renderTotals(data: ProformaInvoiceTemplateData): string {
    const t = data.totals;
    return `
    <div class="keep">
        <table class="totals">${renderCols(columnWidths(data.showDiscount))}${renderTotalRows(data)}</table>
        <div class="summary">${esc(t.summary)}</div>
        ${t.inWords ? `<div class="words">${esc(t.inWords)}</div>` : '<div class="words"></div>'}
        ${renderSignatures(data)}
    </div>`;
}

function renderSignatures(data: ProformaInvoiceTemplateData): string {
    const row = (role: string, title: string | null, name: string | null): string => `
        <tr>
            <td class="role">${role}</td>
            <td><div class="signed">${title ? esc(title) : ''}</div><div class="line">должность</div></td>
            <td><div class="signed"></div><div class="line">подпись</div></td>
            <td><div class="signed">${name ? esc(name) : ''}</div><div class="line">расшифровка подписи</div></td>
        </tr>`;
    return `<table class="sign">
        ${row('Руководитель', data.signatory.title, data.signatory.name)}
        ${row('Главный (старший) бухгалтер', data.chiefAccountant.title, data.chiefAccountant.name)}
        ${row('Ответственный', null, null)}
    </table>`;
}

export function renderProformaInvoiceHtml(data: ProformaInvoiceTemplateData): string {
    const party = (role: string, line: string): string =>
        `<tr><td class="role">${role}</td><td class="who">${esc(line)}</td></tr>`;
    return `<!doctype html>
    <html lang="ru">
    <head><meta charset="utf-8" /><style>${STYLES}</style></head>
    <body>
        <p class="notice">${esc(data.notice)}</p>
        ${renderBank(data.bank, data.paymentQr.payload)}
        <h1>${esc(data.title)}</h1>
        ${data.dueLine ? `<p class="due">${esc(data.dueLine)}</p>` : ''}
        ${data.purposeLine ? `<p class="due">${esc(data.purposeLine)}</p>` : ''}
        ${data.versionLabel ? `<p class="version">${esc(data.versionLabel)}</p>` : ''}
        ${data.newerVersionNote ? `<p class="newer">${esc(data.newerVersionNote)}</p>` : ''}
        <table class="parties">
            ${party('Поставщик:', data.supplier)}
            ${party('Грузоотправитель:', data.supplier)}
            ${party('Покупатель:', data.buyer)}
            ${party('Грузополучатель:', data.buyer)}
        </table>
        ${renderItems(data.rows, data.showDiscount)}
        ${renderTotals(data)}
    </body>
    </html>`;
}
