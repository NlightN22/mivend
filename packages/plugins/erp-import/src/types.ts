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

export type ImportRecord =
    | { type: 'product'; data: ProductRecord }
    | { type: 'price'; data: PriceRecord }
    | { type: 'stock'; data: StockRecord };

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
