import { OrganizationRequisites } from '../entities/organization-requisites.entity';
import { renderLogoMarkup } from './invoice-template';

export interface ContractTemplateData {
    documentNumber: string;
    issueDate: string;
    seller: {
        legalName: string;
        address: string;
        taxId: string;
    };
    buyer: {
        legalName: string;
    };
    logoDataUri: string | null;
}

export function buildContractTemplateData(
    documentNumber: string,
    requisites: OrganizationRequisites,
    buyerLegalName: string,
    logoDataUri: string | null = null,
): ContractTemplateData {
    return {
        documentNumber,
        issueDate: new Date().toISOString().slice(0, 10),
        seller: {
            legalName: requisites.legalName,
            address: requisites.legalAddress,
            taxId: requisites.inn,
        },
        buyer: {
            legalName: buyerLegalName,
        },
        logoDataUri,
    };
}

// Generic placeholder contract body — a real deployment replaces this with its
// own legal terms template; this demo keeps it deliberately jurisdiction-neutral
// (see invoice-template.ts for the same convention).
export function renderContractHtml(data: ContractTemplateData): string {
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
            .parties { display: flex; justify-content: space-between; gap: 24px; margin: 24px 0; }
            .party { font-size: 12px; line-height: 1.5; }
            .party h3 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #66736e; margin: 0 0 6px; }
            .body-text { font-size: 12px; line-height: 1.7; color: #263732; }
            .signatures { display: flex; justify-content: space-between; margin-top: 60px; font-size: 12px; }
            .signature-line { border-top: 1px solid #14231f; width: 220px; padding-top: 6px; text-align: center; }
        </style>
    </head>
    <body>
        <div class="header">
            ${renderLogoMarkup(data.seller.legalName, data.logoDataUri)}
            <div>
                <p class="title">Service Agreement ${data.documentNumber}</p>
                <p class="doc-meta">Issued ${data.issueDate}</p>
            </div>
        </div>

        <div class="parties">
            <div class="party">
                <h3>Party A (Seller)</h3>
                ${data.seller.legalName}<br />
                ${data.seller.address}<br />
                Tax ID: ${data.seller.taxId}
            </div>
            <div class="party">
                <h3>Party B (Buyer)</h3>
                ${data.buyer.legalName}
            </div>
        </div>

        <p class="body-text">
            This agreement governs the ongoing supply of goods between the parties named above,
            under the terms and pricing communicated separately between them. This is a
            placeholder document generated for demonstration purposes.
        </p>

        <div class="signatures">
            <div class="signature-line">${data.seller.legalName}</div>
            <div class="signature-line">${data.buyer.legalName}</div>
        </div>
    </body>
    </html>`;
}
