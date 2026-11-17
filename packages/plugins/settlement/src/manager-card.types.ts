export interface SalesComparison {
    currentMinor: number;
    previousMinor: number;
}

export interface ManagerSales {
    last30: SalesComparison;
    monthToDayVsPrevMonth: SalesComparison;
    monthToDayVsPrevYear: SalesComparison;
    yearToDay: SalesComparison;
    averageCheckMinor: number | null;
    saleDocuments12m: number;
}

export interface AgingBuckets {
    notDueMinor: number;
    overdue1to30Minor: number;
    overdue31to60Minor: number;
    overdueOver60Minor: number;
}

export interface DebtorRow {
    counterpartyId: string;
    name: string;
    debtMinor: number;
    overdueMinor: number;
}

export interface ManagerReceivables {
    debtMinor: number;
    overdueMinor: number;
    aging: AgingBuckets;
    topDebtors: DebtorRow[];
}

export interface LostCustomerRow {
    counterpartyId: string;
    name: string;
    lastSaleDay: string;
    idleDays: number;
    turnover12mMinor: number;
}

export interface ManagerLostCustomers {
    thresholdDays: number;
    count60: number;
    count90: number;
    count180: number;
    rows: LostCustomerRow[];
}

export interface DynamicsPoint {
    active: number;
    newCustomers: number;
    returned: number;
    lost: number;
}

export interface ManagerDynamics {
    current: DynamicsPoint;
    previous: DynamicsPoint;
    previousYear: DynamicsPoint;
    historyStartsAt: string | null;
}

export interface ManagerCard {
    administratorId: string;
    administratorName: string;
    currency: string;
    customersTotal: number;
    customersVisible: number;
    openOrders: number;
    sales: ManagerSales;
    receivables: ManagerReceivables;
    lost: ManagerLostCustomers;
    dynamics: ManagerDynamics;
    computedAt: Date;
}
