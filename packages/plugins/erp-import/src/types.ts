export interface ProductRecord {
    externalId: string;
    sku: string;
    name: string;
    slug: string;
    description?: string;
    price: number;
    stockOnHand: number;
    categoryCode?: string;
    brandCode?: string;
    onSale?: boolean;
    enabled?: boolean;
}

export interface PriceRecord {
    sku: string;
    priceTypeCode: string;
    price: number;
}

export interface StockRecord {
    sku: string;
    stockOnHand: number;
}

export interface CustomerRecord {
    email: string;
    firstName: string;
    lastName: string;
    password: string;
}

export interface CounterpartyRecord {
    erpId: string;
    legalName: string;
    shortName: string;
    inn?: string | null;
    creditLimit: number;
    creditBalance: number;
    paymentDelayDays: number;
    priceType: string;
    isActive: boolean;
}

export interface CustomerCounterpartyRecord {
    customerEmail: string;
    counterpartyErpId: string;
}

export interface TradingPointRecord {
    erpId: string;
    counterpartyErpId: string;
    name: string;
    address: string;
    workingHours?: string | null;
    isActive: boolean;
    contactName?: string | null;
    contactPhone?: string | null;
}

export type ImportRecord =
    | { type: 'product'; data: ProductRecord }
    | { type: 'price'; data: PriceRecord }
    | { type: 'stock'; data: StockRecord }
    | { type: 'customer'; data: CustomerRecord }
    | { type: 'counterparty'; data: CounterpartyRecord }
    | { type: 'customerCounterparty'; data: CustomerCounterpartyRecord }
    | { type: 'tradingPoint'; data: TradingPointRecord };

export interface BatchImportBody {
    exchangeId: string;
    records: ImportRecord[];
}

export type ImportRunStatus = 'pending' | 'processing' | 'done' | 'failed';

export interface ImportRunResult {
    runId: string;
    exchangeId: string;
    status: ImportRunStatus;
    total: number;
    processed: number;
    failed: number;
    errors: Array<{ index: number; message: string }>;
    createdAt: string;
    finishedAt: string | null;
}
