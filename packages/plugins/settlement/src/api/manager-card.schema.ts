export const managerCardSdl = `
    type ManagerSalesComparison {
        currentMinor: Money!
        previousMinor: Money!
    }

    type ManagerSales {
        "Last 30 days against the 30 before."
        last30: ManagerSalesComparison!
        "Month to date against the same days of the previous month."
        monthToDayVsPrevMonth: ManagerSalesComparison!
        "Month to date against the same days of the same month a year ago."
        monthToDayVsPrevYear: ManagerSalesComparison!
        yearToDay: ManagerSalesComparison!
        "Net turnover of 12 months per sales document; null without a sales document."
        averageCheckMinor: Money
        saleDocuments12m: Int!
    }

    type ManagerAgingBuckets {
        notDueMinor: Money!
        overdue1to30Minor: Money!
        overdue31to60Minor: Money!
        overdueOver60Minor: Money!
    }

    type ManagerDebtor {
        counterpartyId: ID!
        name: String!
        debtMinor: Money!
        overdueMinor: Money!
    }

    type ManagerReceivables {
        debtMinor: Money!
        overdueMinor: Money!
        aging: ManagerAgingBuckets!
        topDebtors: [ManagerDebtor!]!
    }

    type ManagerLostCustomer {
        counterpartyId: ID!
        name: String!
        lastSaleDay: String!
        idleDays: Int!
        turnover12mMinor: Money!
    }

    type ManagerLostCustomers {
        thresholdDays: Int!
        count60: Int!
        count90: Int!
        count180: Int!
        rows: [ManagerLostCustomer!]!
    }

    type ManagerDynamicsPoint {
        active: Int!
        newCustomers: Int!
        returned: Int!
        lost: Int!
    }

    type ManagerDynamics {
        current: ManagerDynamicsPoint!
        previous: ManagerDynamicsPoint!
        previousYear: ManagerDynamicsPoint!
        "First day with rolled-up turnover; comparisons that start earlier are incomplete."
        historyStartsAt: String
    }

    """
    Analytics of one manager over the customers the caller may see; customersTotal counts all assigned customers,
    customersVisible the ones inside the caller's scope.
    """
    type ManagerCard {
        administratorId: ID!
        administratorName: String!
        currency: String!
        customersTotal: Int!
        customersVisible: Int!
        openOrders: Int!
        sales: ManagerSales!
        receivables: ManagerReceivables!
        lost: ManagerLostCustomers!
        dynamics: ManagerDynamics!
        computedAt: DateTime!
    }

    extend type Query {
        "Needs ReadManagerCard; null when the manager is outside the caller's scope. lostAfterDays is 60, 90 or 180."
        managerCard(administratorId: ID!, lostAfterDays: Int): ManagerCard
    }
`;
