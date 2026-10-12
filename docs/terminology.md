# Terminology

Fixed vocabulary for documents and payments. Use these terms in code, UI, docs and issues.

## Documents

| Term | Meaning | Who issues it | Source of truth |
| --- | --- | --- | --- |
| **Proforma invoice** (`ProformaInvoice`) | A payment request issued before shipment: number, organization, lines, amounts at that moment. Not an accounting document. Requested on demand or created by the payment flow, versioned and immutable (#206). | mivend | mivend |
| **Sales invoice** (`SalesInvoice`) | The fact of sale and actual shipment (in 1C: realization of goods and services). Creates the receivable. Mirrored read-only, keeps the ERP's id and number. | ERP, never mivend | ERP |
| **Payment** | Money received: bank payment, cash receipt, card payment. | payer / ERP / acquirer | by origin |
| **Sales return / credit note** | A return from the customer. | ERP | ERP |

- The ERP's cross-document receivable fact may travel on a neutral `SettlementDocument` transport with a raw
  ERP `documentType`; mivend maps it to its own term on receipt (a realization becomes a `SalesInvoice`).
- A proforma invoice is not a sales invoice and never becomes one: the sale is the ERP's fact.

## The word "invoice" alone

**Do not use bare "invoice" anywhere** (code, UI, docs, issues, commits). Say *proforma invoice* or
*sales invoice*. The old `Invoice` entity is the proforma invoice and was renamed in #223 (table `proforma_invoice`); the SalesInvoice mirror
is a separate later task. Legacy mentions in older docs are corrected as files are touched.

## Related

- Form of payment vs terms: `docs/payments.md`, "Target model".
- Identity of documents: `docs/identifiers.md`.
