import { graphql } from '@vendure/dashboard';

// Issue #133 Phase 2 — Dashboard Counterparty list/detail pages. Field selection intentionally
// mirrors the admin schema fields added in Phase 1 (managerErpId, linkedCustomerId) plus the
// pre-existing fields the list/detail concepts need; no new backend fields required beyond
// Phase 1's.
export const counterpartyItemFragment = graphql(`
    fragment CounterpartyItem on Counterparty {
        id
        erpId
        legalName
        shortName
        inn
        creditLimit
        creditBalance
        paymentDelayDays
        priceType
        isActive
        assignedManagerId
        managerErpId
        linkedCustomerId
        branchId
    }
`);

export const counterpartyListDocument = graphql(
    `
        query CounterpartyListForDashboard($options: CounterpartyListOptions) {
            counterparties(options: $options) {
                items {
                    ...CounterpartyItem
                }
                totalItems
            }
        }
    `,
    [counterpartyItemFragment],
);

export const counterpartyDetailDocument = graphql(`
    query CounterpartyDetailForDashboard($id: ID!) {
        counterparty(id: $id) {
            id
            erpId
            legalName
            shortName
            inn
            creditLimit
            creditBalance
            paymentDelayDays
            priceType
            isActive
            assignedManagerId
            managerErpId
            linkedCustomerId
            branchId
            departmentId
            erpGroupLabel
            creditTermOverrideExtraDays
            legalAddress
            factualAddress
            phone
            officialEmail
            tradingPoints {
                id
            }
            teamMembers {
                id
            }
        }
    }
`);

// Lightweight administrator lookup, used two ways: (1) resolving the ERP Manager column's
// managerErpId to a name via customFields.erpId — the unique link UserEnrichmentService writes
// when an ERP user becomes a real login, see counterparty-display.ts's formatManager — and
// (2) the Assign Manager bulk-action dialog's own administrator picker (by id). This is the same
// native `administrators` query the Administrators screen itself uses, just with a narrower
// field selection.
export const administratorNamesForCounterpartyDocument = graphql(`
    query AdministratorNamesForCounterparty($options: AdministratorListOptions) {
        administrators(options: $options) {
            items {
                id
                firstName
                lastName
                customFields {
                    erpId
                }
            }
            totalItems
        }
    }
`);

// Resolves managerErpId to a real name for managers who have no Administrator account at all yet
// (access-control's ErpUser, populated straight from the ERP's UserChanged stream regardless of
// linking status — see counterparty-display.ts's formatManager for why this fallback level
// exists). `pendingErpUsers` already filters to `status: 'unlinked'`, which is exactly this
// page's use case: an already-linked erpId's name comes from the administrators query above
// instead (a linked ErpUser would just be redundant with what that query already returns).
export const pendingErpUsersForCounterpartyDocument = graphql(`
    query PendingErpUsersForCounterparty($options: ErpUserListOptions) {
        pendingErpUsers(options: $options) {
            items {
                erpId
                fullName
            }
            totalItems
        }
    }
`);

export const reassignCounterpartyManagerDocument = graphql(`
    mutation ReassignCounterpartyManagerFromDashboard($counterpartyId: ID!, $administratorId: ID!) {
        reassignCounterpartyManager(
            counterpartyId: $counterpartyId
            administratorId: $administratorId
        ) {
            id
            assignedManagerId
        }
    }
`);
