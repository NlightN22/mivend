import type { PriceTypeVisibility } from '@mivend/plugin-customer-pricing';
import type { DocumentRecord, OrganizationRequisitesRecord } from '@mivend/plugin-documents';
import type {
    DepartmentRecordInput,
    PositionRecordInput,
    BranchRecordInput,
    WarehouseRecordInput,
    EmployeeRecordInput,
} from '@mivend/plugin-access-control';
import type { DepartmentBranchRecordInput } from './handlers/department-branch.handler';
import type {
    SettlementBalanceRecord,
    SettlementDocumentRecord,
    SettlementDocumentTypeRecord,
} from './settlement-types';

export interface OrderStatusRecord {
    code: string;
    version: string;
    name: string;
    rank: number;
    terminal: boolean;
    customerVisible: boolean;
    description: string;
    customerGroup: string;
    warehouseStarted: boolean;
    shipped: boolean;
    delivered: boolean;
    cancelled: boolean;
}

export interface WarehouseRecord extends WarehouseRecordInput {
    stockLocationName?: string;
}

export interface ManufacturerRecord {
    code: string;
    name: string;
}

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
    manufacturerCode?: string;
    onSale?: boolean;
    enabled?: boolean;
    weight?: number;
    multiplicity?: number;
    // Seeded placeholder: not yet sourced from a real ERP export (see seed-erp.mjs).
    // Real source is the ERP warehouse storage-location assignment; see docs/payments.md.
    organizationId?: number;
}

export interface CrossReferenceRecord {
    externalId: string;
    refs: Array<{ oemCode: string; oemBrand: string }>;
}

export interface PriceRecord {
    productExternalId: string;
    priceTypeCode: string;
    price: number;
}

export interface PriceTypeRecord {
    code: string;
    name: string;
    visibility: PriceTypeVisibility;
    isPurchase?: boolean;
    ceilingMultiplier?: number;
}

export interface StockOrganizationRecord {
    entityId: string;
    productErpId: string;
    organizationErpId: string;
    quantity: number;
    isActive?: boolean;
}

export interface StorageLocationRecord {
    entityId: string;
    productErpId: string;
    organizationErpId: string;
    warehouseErpId: string;
    priority?: number;
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
    // erpId of the contract that drives paymentDelayDays (Counterparty.mainContractId).
    mainContractErpId?: string | null;
    // departmentId: erpId of the ERP Department this counterparty belongs to — pure ERP org data,
    // mirrored as-is (informational; see docs/access-control.md's "Branch vs Department" note).
    departmentId?: string | null;
    // Display and filtering only; never use for access control or business rules.
    // The ERP's grouping concept is inconsistent, so the label is not a reliable category.
    erpGroupLabel?: string | null;
    phone?: string | null;
    officialEmail?: string | null;
}

export interface ContractRecord {
    erpId: string;
    counterpartyErpId: string;
    name?: string;
    organizationId?: string;
    priceTypeId: string;
    creditLimit?: string | null;
    debtDaysLimit?: number | null;
    isActive: boolean;
    controlledIndividually?: boolean;
    isCustomerContract?: boolean;
    paymentDelayDays?: number | null;
    currency?: string | null;
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
    iconFile?: string | null;
    isActive?: boolean;
    isDeleted?: boolean;
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

export interface CounterpartyDiscountRuleRecord {
    erpId: string;
    counterpartyErpId: string;
    productErpId?: string | null;
    // The ERP condition enum value name (DiscountConditionKind.erpName); empty = unconditional.
    condition: string;
    conditionValue: number;
    // Negative percent is a markup.
    percent: number;
    validFrom: string;
    validTo?: string | null;
}

export type ImportRecord =
    | { type: 'product'; data: ProductRecord }
    | { type: 'price'; data: PriceRecord }
    | { type: 'priceType'; data: PriceTypeRecord }
    | { type: 'stock'; data: StockRecord }
    | { type: 'customer'; data: CustomerRecord }
    | { type: 'counterparty'; data: CounterpartyRecord }
    | { type: 'customerCounterparty'; data: CustomerCounterpartyRecord }
    | { type: 'tradingPoint'; data: TradingPointRecord }
    | { type: 'category'; data: CategoryRecord }
    | { type: 'crossReference'; data: CrossReferenceRecord }
    | { type: 'discountRule'; data: DiscountRuleRecord }
    | { type: 'counterpartyDiscountRule'; data: CounterpartyDiscountRuleRecord }
    | { type: 'document'; data: DocumentRecord }
    | { type: 'organizationRequisites'; data: OrganizationRequisitesRecord }
    | { type: 'department'; data: DepartmentRecordInput }
    | { type: 'position'; data: PositionRecordInput }
    | { type: 'branch'; data: BranchRecordInput }
    | { type: 'departmentBranch'; data: DepartmentBranchRecordInput }
    | { type: 'employee'; data: EmployeeRecordInput }
    | { type: 'warehouse'; data: WarehouseRecord }
    | { type: 'contract'; data: ContractRecord }
    | { type: 'orderStatus'; data: OrderStatusRecord }
    | { type: 'stockOrganization'; data: StockOrganizationRecord }
    | { type: 'storageLocation'; data: StorageLocationRecord }
    | { type: 'manufacturer'; data: ManufacturerRecord }
    | { type: 'settlementDocument'; data: SettlementDocumentRecord }
    | { type: 'settlementBalance'; data: SettlementBalanceRecord }
    | { type: 'settlementDocumentType'; data: SettlementDocumentTypeRecord };

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
