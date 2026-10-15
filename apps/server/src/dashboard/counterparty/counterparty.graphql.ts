import { graphql } from '@vendure/dashboard';

// Field selection mirrors the admin schema fields from Phase 1 (managerErpId, linkedCustomerId).
// Needs no backend fields beyond Phase 1's.
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

// managerErpId resolves via customFields.erpId, the unique link UserEnrichmentService writes
// when an ERP user becomes a login; the same administrators query as the Administrators screen.
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

// Fallback for managers without an Administrator account: ErpUser comes from the UserChanged
// stream regardless of linking; this filter keeps only unlinked ones, linked names come from above.
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

export const reassignCounterpartyManagerByFilterDocument = graphql(`
    mutation ReassignCounterpartyManagerByFilterFromDashboard(
        $filter: CounterpartyListFilter!
        $administratorId: ID!
        $expectedCount: Int!
    ) {
        reassignCounterpartyManagerByFilter(
            filter: $filter
            administratorId: $administratorId
            expectedCount: $expectedCount
        )
    }
`);

// One mutation per selected row, each result reported independently:
// a bad row (missing phone/officialEmail, already linked, out of scope) never blocks the rest.
export const applyCounterpartyPortalAccessChangesDocument = graphql(`
    mutation ApplyCounterpartyPortalAccessChangesFromDashboard(
        $changes: [CounterpartyPortalAccessChangeInput!]!
    ) {
        applyCounterpartyPortalAccessChanges(changes: $changes) {
            counterpartyId
            success
            error
            customerId
        }
    }
`);
