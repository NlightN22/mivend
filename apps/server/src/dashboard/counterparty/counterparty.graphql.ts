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

// Lightweight administrator lookup for resolving assignedManagerId to a display name (list and
// bulk-action dialog) — this is the same native `administrators` query the Administrators screen
// itself uses, just with a narrower field selection.
export const administratorNamesForCounterpartyDocument = graphql(`
    query AdministratorNamesForCounterparty($options: AdministratorListOptions) {
        administrators(options: $options) {
            items {
                id
                firstName
                lastName
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
