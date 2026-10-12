# Terminology

Fixed vocabulary for documents and payments. Use these terms in code, UI, docs and issues.

## Documents

| Term | Meaning | Who issues it | Source of truth |
| --- | --- | --- | --- |
| **Proforma invoice** (`ProformaInvoice`) | A payment request issued before shipment: number, organization, lines, amounts at that moment. Not an accounting document. Requested on demand or created by the payment flow, versioned and immutable (#206). | mivend | mivend |
| **Sales invoice** (`SalesInvoice`) | The fact of sale and actual shipment (in 1C: realization of goods and services). Creates the receivable. Mirrored read-only, keeps the ERP's id and number. | ERP, never mivend | ERP |
| **Payment** | Money received: bank payment, cash receipt, card payment. | payer / ERP / acquirer | by origin |
| **Sales return / credit note** | A return from the customer. | ERP | ERP |

- A proforma invoice is not a sales invoice and never becomes one: the sale is the ERP's fact.
- **Version** of a proforma invoice: a changed order content makes a new document (own number, `version` + 1); the
  older unpaid one is `superseded` (kept, not valid). The version is an attribute shown as "v2", not part of the number.

## The word "invoice" alone

**Do not use bare "invoice" anywhere** (code, UI, docs, issues, commits). Say *proforma invoice* or
*sales invoice*. The old `Invoice` entity is the proforma invoice and was renamed in #223 (table `proforma_invoice`); the SalesInvoice mirror
is a separate later task. The legacy persisted keys, routes and file names were renamed in #223 (document type `proforma-invoice`,
`/proforma-invoices` routes, `ReadProformaInvoice` permission, access-scope key `proformaInvoice`).

## Mapping from external and legacy names

- The order-changed event's `linkedDocuments[]` kind `proforma_invoice` (event-contracts >= 0.63.0) maps to
  ProformaInvoice. The legacy kind `invoice` is no longer produced or accepted by the integration side (deployed
  2026-10-12, no compatibility layer); `payment` and `realization` (maps to the future SalesInvoice) are unchanged.
  Not yet observed live: no posted proforma is linked to an order on the integration contour.
- GraphQL fields and types renamed to `proformaInvoice*` (for example `PaymentAttempt.proformaInvoiceId`) are a
  breaking change for external Shop API / Admin API clients.

## Related

- Form of payment vs terms: `docs/payments.md`, "Target model".
- Identity of documents: `docs/identifiers.md`.
