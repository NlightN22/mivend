import { gql } from 'graphql-tag';

// Hand-written on purpose: Vendure's generated *FilterParameter types are invisible to the base schema.
export const orderListSchema = gql`
    "Paging, filter and sort for visibleOrders; field names are a fixed whitelist, at most 20 conditions."
    input OrderListInput {
        skip: Int
        take: Int
        filter: OrderListFilter
        sort: OrderListSort
    }

    input OrderListFilter {
        code: StringOperators
        createdAt: DateOperators
        orderPlacedAt: DateOperators
        state: StringOperators
        totalWithTax: NumberOperators
        placedByAdministratorId: StringOperators
        reservationState: StringOperators
        reservationFailureReason: StringOperators
        erpStatus: StringOperators
        hasCheckFindings: BooleanOperators
        _and: [OrderListFilter!]
    }

    input OrderListSort {
        code: SortOrder
        state: SortOrder
        totalWithTax: SortOrder
        orderPlacedAt: SortOrder
        createdAt: SortOrder
    }
`;
