# Counterparty ownership and the return path (#368)

The ERP and mivend both hold a counterparty. A fixed authority per field decides who may change it, never
last-write-wins (see `architecture.md`). The single source in code is `COUNTERPARTY_FIELD_OWNERS`
(`packages/plugins/counterparty/src/counterparty-ownership.ts`); a new `Counterparty` column does not compile until it
is listed there, and a unit test pins the portal-owned set.

| Owner | Fields | Inbound stream |
| --- | --- | --- |
| ERP | activity status (`isActive`), credit limit, credit balance, payment delay, price type, main contract id, main bank account id, ERP manager reference (`managerErpId`), ERP department (`departmentId`) | keeps writing them on every event |
| Portal | names, full name, inn, kpp, ogrnip, okpo, legal type, legal form, region, legal and factual address, phone, official e-mail, group label, owner (`assignedManagerId`), team members, contact infos | seeds them on the first arrival, then never writes them |
| Local | `erpId`, `version`, `branchId`, `branchOverrideId`, `creditTermOverrideExtraDays` | never set by the stream (branch and department stay derived from the ERP department and the manual override) |

- `counterparty_erp` is the mirror: the last state the ERP sent, written only by the stream (`CounterpartyErpMirrorService`),
  keyed by ERP id. The migration seeds it from the existing records.
- First arrival creates `counterparty` from the event, seeds the team from the other managers in `managerIds` (role
  `observer`) and the contact channels. Afterwards an event only fills an empty owner; a portal reassignment survives.
- `counterparty.version` counts committed changes of the portal-owned fields. Writers that change them go through
  `CounterpartyVersionService.bump` in the same transaction (owner reassignment, team add/remove, the admin
  `upsertCounterparty`); `counterparty-writers.test.ts` fails when a new writer of the row is not classified. A bump
  publishes `CounterpartyVersionedEvent(erpId, version)` after commit.
- `erp-integration` registers the counterparty and the trading point in one entity registry
  (`versioned-entities.ts`): event, table, key, topic, encoder. One listener, one reconciler, one recovery path serve
  both. Outbound type `counterparty.changed` -> topic `mivend.counterparty.commands.v1`, key = ERP id, plain protobuf
  `CounterpartyCommand` (`oneof command { counterparty_snapshot }`).
- Managers: `manager_id` = owner, `manager_ids` = owner plus other team members as ERP user ids. An administrator
  without an ERP user link is skipped and listed by `counterpartiesWithUnlinkedManagers`. Roles stay portal-only.
  `ReassignCounterpartyManager` and the scope rules (#366) are unchanged.
- Drift (`ManageErpIntegration`): `counterpartiesDifferingFromErp`, `counterpartiesNotConfirmedByErp`,
  `counterpartiesWithUnlinkedManagers`.
- `notification_phone` is in the contract but mivend stores no such column, so it is never sent.
- Not covered by a bump yet: manual contact channels (no editing exists before #332); add the bump with that editor.
- Snapshot consistency: the record, team, ERP links and contacts are four separate reads under the outbound lock, not
  the `counterparty:<erpId>` lock the portal writers use. A write between the reads can send newer team data labelled
  with the older version; the newer version's event follows and is not deduplicated, so the ERP converges.
