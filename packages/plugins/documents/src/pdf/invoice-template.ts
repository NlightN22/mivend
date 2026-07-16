import { OrganizationRequisites } from '../entities/organization-requisites.entity';

export interface InvoiceLineData {
    name: string;
    sku: string;
    quantity: number;
    unitPrice: string;
    lineTotal: string;
}

export interface InvoiceSourceLine {
    quantity: number;
    unitPriceWithTax: number;
    linePriceWithTax: number;
    productVariant: { name: string; sku: string };
}

// Decoupled from a raw Vendure `Order` — a document can now be one of several
// organization-split invoices for an order (docs/payments.md "Organizations"), each with its
// own document number, total, and (usually filtered) line subset — not the whole order.
export interface InvoiceSource {
    documentNumber: string;
    issueDate: Date;
    currencyCode: string | null;
    totalAmount: number;
    lines: InvoiceSourceLine[];
}

export interface InvoiceTemplateData {
    documentNumber: string;
    issueDate: string;
    seller: {
        legalName: string;
        address: string;
        taxId: string;
        registrationNumber: string;
        bankDetails: string | null;
    };
    buyer: {
        legalName: string;
    };
    lines: InvoiceLineData[];
    currencySymbol: string;
    totalAmount: string;
    // Base64 data URI (e.g. "data:image/png;base64,...") — embedded directly so
    // Puppeteer never needs to resolve a hostname/URL for the image. Null when
    // no logo has been set via the Admin API (see OrganizationRequisites.logoAssetId).
    logoDataUri: string | null;
}

// Generic, universal document — no jurisdiction-specific labels or fields, per
// this project's public-repo convention (see AGENTS.md privacy section). Real
// deployments swap this template (and OrganizationRequisites' seeded values)
// for whatever their own market/jurisdiction requires — this is a demo default.
function formatMoney(minorUnits: number, currencySymbol: string): string {
    return `${(minorUnits / 100).toFixed(2)} ${currencySymbol}`;
}

export function buildInvoiceTemplateData(
    source: InvoiceSource,
    requisites: OrganizationRequisites,
    buyerLegalName: string,
    logoDataUri: string | null = null,
): InvoiceTemplateData {
    const currencySymbol = source.currencyCode ?? '';
    const bankDetails = requisites.bankName
        ? [requisites.bankName, requisites.bankAccount, requisites.bankBik]
              .filter(Boolean)
              .join(' · ')
        : null;

    return {
        documentNumber: source.documentNumber,
        issueDate: source.issueDate.toISOString().slice(0, 10),
        seller: {
            legalName: requisites.legalName,
            address: requisites.legalAddress,
            taxId: requisites.inn,
            registrationNumber: requisites.ogrn ?? requisites.kpp ?? '—',
            bankDetails,
        },
        buyer: {
            legalName: buyerLegalName,
        },
        lines: source.lines.map(line => ({
            name: line.productVariant.name,
            sku: line.productVariant.sku,
            quantity: line.quantity,
            unitPrice: formatMoney(line.unitPriceWithTax, currencySymbol),
            lineTotal: formatMoney(line.linePriceWithTax, currencySymbol),
        })),
        currencySymbol,
        totalAmount: formatMoney(source.totalAmount, currencySymbol),
        logoDataUri,
    };
}

function logoInitial(legalName: string): string {
    return legalName.trim().charAt(0).toUpperCase() || '?';
}

// Shared between invoice-template.ts and contract-template.ts — a real logo
// (base64-embedded) when set via the Admin API, otherwise a generic initial-
// letter badge. Never a jurisdiction-specific or hardcoded brand mark.
export function renderLogoMarkup(legalName: string, logoDataUri: string | null): string {
    if (logoDataUri) {
        return `<img class="logo" src="${logoDataUri}" alt="${legalName} logo" />`;
    }
    return `<div class="logo logo--fallback">${logoInitial(legalName)}</div>`;
}

export function renderInvoiceHtml(data: InvoiceTemplateData): string {
    const rows = data.lines
        .map(
            line => `
            <tr>
                <td>${line.name}</td>
                <td>${line.sku}</td>
                <td class="num">${line.quantity}</td>
                <td class="num">${line.unitPrice}</td>
                <td class="num">${line.lineTotal}</td>
            </tr>`,
        )
        .join('');

    return `
    <!doctype html>
    <html>
    <head>
        <meta charset="utf-8" />
        <style>
            body { font-family: 'DejaVu Sans', Arial, sans-serif; color: #14231f; margin: 0; padding: 36px; }
            .header { display: flex; align-items: center; gap: 14px; margin-bottom: 28px; }
            .logo { width: 48px; height: 48px; border-radius: 50%; object-fit: cover; }
            .logo--fallback { background: #00a878; color: #fff;
                    display: flex; align-items: center; justify-content: center; font-size: 22px; font-weight: 800; }
            .title { font-size: 26px; font-weight: 800; margin: 0; }
            .doc-meta { color: #66736e; font-size: 13px; margin-top: 2px; }
            .parties { display: flex; justify-content: space-between; gap: 24px; margin-bottom: 24px; }
            .party { font-size: 12px; line-height: 1.5; }
            .party h3 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #66736e; margin: 0 0 6px; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th, td { border-bottom: 1px solid #dde7e2; padding: 8px 6px; text-align: left; }
            th { color: #66736e; text-transform: uppercase; font-size: 10px; letter-spacing: 0.04em; }
            .num { text-align: right; }
            .total-row td { border-bottom: none; font-weight: 800; font-size: 14px; padding-top: 14px; }
        </style>
    </head>
    <body>
        <div class="header">
            ${renderLogoMarkup(data.seller.legalName, data.logoDataUri)}
            <div>
                <p class="title">Invoice ${data.documentNumber}</p>
                <p class="doc-meta">Issued ${data.issueDate}</p>
            </div>
        </div>

        <div class="parties">
            <div class="party">
                <h3>Seller</h3>
                ${data.seller.legalName}<br />
                ${data.seller.address}<br />
                Tax ID: ${data.seller.taxId}<br />
                Registration No.: ${data.seller.registrationNumber}
                ${data.seller.bankDetails ? `<br />${data.seller.bankDetails}` : ''}
            </div>
            <div class="party">
                <h3>Buyer</h3>
                ${data.buyer.legalName}
            </div>
        </div>

        <table>
            <thead>
                <tr>
                    <th>Item</th>
                    <th>SKU</th>
                    <th class="num">Qty</th>
                    <th class="num">Unit price</th>
                    <th class="num">Total</th>
                </tr>
            </thead>
            <tbody>
                ${rows}
                <tr class="total-row">
                    <td colspan="4">Total</td>
                    <td class="num">${data.totalAmount}</td>
                </tr>
            </tbody>
        </table>
    </body>
    </html>`;
}
