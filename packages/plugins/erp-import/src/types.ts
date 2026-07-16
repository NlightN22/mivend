import type { DocumentRecord, OrganizationRequisitesRecord } from '@mivend/plugin-documents';
import type {
    DepartmentRecordInput,
    BranchRecordInput,
    EmployeeRecordInput,
} from '@mivend/plugin-access-control';

export interface ProductRecord {
    externalId: string;
    sku: string;
    name: string;
    slug: string;
    description?: string;
    fullName?: string;
    price: number;
    stockOnHand: number;
    categoryCode?: string;
    brandCode?: string;
    onSale?: boolean;
    enabled?: boolean;
    weight?: number;
    multiplicity?: number;
    // Which of our own legal entities (OrganizationRequisites.id) owns the stock this product
    // is fulfilled from — driven by 1C's warehouse storage-location assignment. See
    // docs/payments.md "Organizations". Not yet sourced from a real 1C export — seeded directly
    // for now (infrastructure/scripts/seed-erp.mjs).
    organizationId?: number;
}

export interface CrossReferenceRecord {
    externalId: string;
    refs: Array<{ oemCode: string; oemBrand: string }>;
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
    // erpId of the Department/Branch this counterparty belongs to — see AccessScopeService
    // (packages/plugins/access-control), which resolves 'department' scope by comparing these
    // against the caller's own department/branch.
    departmentId?: string | null;
    branchId?: string | null;
    // Free-text group/segment label from the ERP — display and filtering only, never used for
    // access control or business rules (1C's own grouping concept is inconsistent). See
    // Counterparty.erpGroupLabel's doc comment.
    erpGroupLabel?: string | null;
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
    latitude?: number | null;
    longitude?: number | null;
    workingHours?: string | null;
    isActive: boolean;
    contactName?: string | null;
    contactPhone?: string | null;
}

export interface CategoryRecord {
    erpId: string;
    name: string;
    parentErpId: string | null;
}

export interface DiscountRuleRecord {
    erpId: string;
    priceTypeCode: string;
    facetCode: string | null;
    facetValueCode: string | null;
    percent: number;
    validFrom: string;
    validTo: string;
    minWeightKg?: number | null;
    // Decimal amount (e.g. rubles), same convention as PriceRecord.price — converted
    // to the smallest currency unit by discount-rule.handler.ts.
    minAmount?: number | null;
}

export type ImportRecord =
    | { type: 'product'; data: ProductRecord }
    | { type: 'price'; data: PriceRecord }
    | { type: 'stock'; data: StockRecord }
    | { type: 'customer'; data: CustomerRecord }
    | { type: 'counterparty'; data: CounterpartyRecord }
    | { type: 'customerCounterparty'; data: CustomerCounterpartyRecord }
    | { type: 'tradingPoint'; data: TradingPointRecord }
    | { type: 'category'; data: CategoryRecord }
    | { type: 'crossReference'; data: CrossReferenceRecord }
    | { type: 'discountRule'; data: DiscountRuleRecord }
    | { type: 'document'; data: DocumentRecord }
    | { type: 'organizationRequisites'; data: OrganizationRequisitesRecord }
    | { type: 'department'; data: DepartmentRecordInput }
    | { type: 'branch'; data: BranchRecordInput }
    | { type: 'employee'; data: EmployeeRecordInput };

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
