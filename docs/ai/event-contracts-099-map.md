# event-contracts 0.99.0 consumer map (#391)

Scope: contract changelog 0.92.0-0.99.0. 0.92.0 removed every field that an event used to copy from another entity;
the data now lives in its own stream. 0.93.0-0.99.0 are additive (currency, 115 documents, 10 catalogs).
Decisions below are final for this change; "now" = consumed in this change, "deferred" = not consumed, with the reason.
Line numbers are in `packages/plugins/erp-integration/src` (before this change).

Rule used everywhere: a field that is no longer sent must never clear what is stored. Handlers that treated an
absent field as "the ERP cleared it" (#259) stop writing those fields; the replacement stream writes them.

## Removed or changed fields

| Event field (removed or changed) | Read today | Used for | Replacement / decision |
|---|---|---|---|
| `OrderChanged`: `lines[].reservedQuantity` | `handlers/order-changed.handler.ts:107` | reserve hand-over, release of local reservations | `OrderState.lines[].reservedQuantity`. now: `order-state` handler |
| `OrderChanged.statusCode` | `order-changed.handler.ts:53` | derived order status | `OrderState.statusCode`. now |
| `OrderChanged.paidAmount` | `handlers/external-order-input.ts:42` | paid amount on the order | `OrderState.paidAmount`. now |
| `OrderChanged.linkedDocuments` | `handlers/erp-flags-payload.ts:18` | accounting flags of linked documents | `OrderState.linkedDocuments`. now |
| `OrderChangedLine.shippedQuantityInSettlements` | `erp-flags-payload.ts:35` | shipped quantity shown to the customer | `OrderState.lines[]`. now |
| `OrderChanged.shipped*`, `cancelledQuantity`, `hasOrder`, `hasRealization`, `inDelivery`, `delivered`, `orderDebt` | not read (status comes from `statusCode`) | n/a | nothing to do; the facts are inside `statusCode` |
| `OrderChanged.totalAmount` (now the document's own sum) | `external-order-input.ts:97` | total of an order created in the ERP | own sum is used. `OrderState.totalWithCorrections` deferred: a correction-adjusted total cannot be split into VAT without approximation |
| `OrderChanged.currency` -> `currencyId` | not read | n/a | n/a |
| `OrganizationChanged` bank name, account, BIK, correspondent account | `handlers/organization.handler.ts:36` | requisites on proforma invoices and contracts | `mainBankAccountId` -> bank-account mirror -> bank mirror, derived by our side. now |
| `OrganizationChanged.legalAddress`, `phone` | `organization.handler.ts:36` | requisites, phone | `contact-info` set of the organization: the only address row when there is exactly one (kind names are not in 0.99.0, so legal vs actual cannot be told apart), first default phone row. now |
| `OrganizationChanged.signatories`, `contactInfos` | `organization.handler.ts:44,49` | signatories were a constant empty list; channels | signatories: dropped, no data ever came. channels: `contact-info`. now |
| `CounterpartyChanged.legalAddress`, `factualAddress` | `handlers/counterparty.handler.ts:67-68` | seed of portal-owned columns | not derivable without contact kind names (0.100.0 catalog `contact-information-kind`). Not written; stored values kept; addresses stay available as address contact points. deferred |
| `CounterpartyChanged.phone`, `officialEmail`, `notificationPhone` | `counterparty.handler.ts:69-70` | seed of portal-owned columns, activation readiness | first default phone / e-mail row of the `contact-info` set. now |
| `CounterpartyChanged.erpGroupLabel` | `counterparty.handler.ts:57` | group label seed | no replacement (the event carries no group reference). Not written; stored kept. deferred, IS side gap |
| `CounterpartyChanged.departmentId` | `counterparty.handler.ts:61` | branch assignment input | no replacement (needs user -> individual link). Not written; the manager's department remains the second input. deferred, IS side gap |
| `CounterpartyChanged.contactInfos` | `counterparty.handler.ts:50` | contact points | `contact-info`. now |
| `CounterpartyContactChanged.phone`, `email`, `contactInfos` | `handlers/counterparty-contact.handler.ts:38-40,57` | mirror columns, contact person channels | channels: `contact-info` (owner = the contact). Mirror columns now mirror what the stream sends (null). now |
| `UserChanged.email` | `handlers/user.handler.ts:28` | match an Administrator by e-mail | e-mail row of the `contact-info` set when its owner is the user; if the set is keyed by the user's individual instead, linking of NEW users stops (existing links keep working by ERP id). now, limit reported |
| `UserChanged.departmentId`, `positionId` | `user.handler.ts:29,33` | access scope, branch assignment | staff-record is keyed by the employee's counterparty and `UserChanged` has no individual id, so the chain user -> individual -> counterparty -> set is broken. Not written; stored kept; new users get no department. deferred, IS side gap (needs `individual_id` on the user) |
| `UserChanged.contactInfos`, `role` | `user.handler.ts:49`; role never read | channels | `contact-info`. now |
| `PointOfSaleChanged.address`, `contactPhone` | `handlers/point-of-sale.handler.ts:62,65` | trading point address and phone | single address row / first default phone row of the `contact-info` set; filled only into empty fields (trading point is mivend-owned). now |
| `PointOfSaleChanged.contactInfos` | `point-of-sale-extra.ts:28`, `point-of-sale.handler.ts:69` | channels | `contact-info`. now |
| `IndividualChanged`, `ContactPersonChanged`, `PersonalContactChanged` `contactInfos` | `handlers/individual.handler.ts:42`, `contact-person.handler.ts:36`, `personal-contact.handler.ts:36` | channels of ERP-backed contact persons | `contact-info`. now |
| `ProductChanged.attributes` | `product-characteristics-mapper.ts:50` | characteristic facets and the product card | `PropertyValuesSet` carries only property and value ids; names need the `object-property` and `object-property-value` catalogs (0.100.0 / 0.101.0). deferred. Now: product events no longer rewrite the `attribute` group (specification and technical requirement groups still replaced), stored attributes stay |
| `ProductChanged.unitIds`, `baseUnitId` | not read | n/a | n/a |
| `ManufacturerCode.manufacturer` -> `manufacturerId` | `product-ancillary-fields.ts:55` | OEM codes of a product | the id is stored in the same column. now |
| `PriceTypeChanged.currency` -> `currencyId` | not read ("currency is skipped") | n/a | n/a |
| `ContractChanged.currency` -> `currencyId`, `mainProject`, `settlementTypeName` | `handlers/contract.handler.ts:88` | contract currency | `currencyId` resolved to the letter code through the currency mirror; the other two are not read. now |
| `RetroBonusSetupChanged.purpose` -> `purposeId` | not read (stored as received) | n/a | n/a |
| `CustomerClaimChanged`, `SalesCorrectionChanged` `currency` -> `currencyId` | `handlers/customer-claim-payload.ts:39`, `sales-correction-payload.ts:42` | stored as received | `currencyId` resolved through the currency mirror. now |
| `NamedRef.name` removed | not read | n/a | n/a |

## New streams

| Stream | Decision |
|---|---|
| `erp.order-state.events.v1` | now. Key = order uuid of the ERP. Applied to mivend orders (reserve hand-over, derived status, paid amount, accounting flags) and to ERP-created orders. Absent value = not computed = nothing written |
| `erp.currency.events.v1` | now. Mirror `erp_currency` (id, letter code, numeric code, full name); `currency_id` of other events is matched by entity id |
| `erp.contact-info.events.v1` | now. Rows parsed on our side (type enumeration, presentation, default flag) and applied to the owner found by ERP id |
| `erp.property-values.events.v1` | deferred: values are ids; the names live in 0.100.0 / 0.101.0 catalogs. Consume together with them |
| `erp.staff-record.events.v1` | deferred: owner is the employee's counterparty and the user has no link to it. Needs `individual_id` on the user from the IS side |
| 115 documents (`company.documents.events.v1`) | deferred: nothing we show needs them. Listed as ignored in `ignored-contract-streams.ts` |
| 10 catalogs (`company.catalog.events.v1`, 0.96.0) | deferred, same reason. Recommended to raise the pin to 0.101.0 when contact kinds (address kind, labels) and property names are taken up |

## Behaviour against an IS still on the old contract

No tolerance code is added (no backward compatibility, owner decision on the IS side). Against an old IS the new mivend
loses: order statuses, reserve hand-over, paid amount and accounting flags (they come only from order-state);
contact channels, phones, e-mails and addresses of every owner (only from contact-info); organization bank
requisites (no `mainBankAccountId`); contract and document currency (no currency stream). Everything else keeps working.
