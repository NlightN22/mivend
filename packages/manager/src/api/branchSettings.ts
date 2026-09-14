import { adminApi } from './client';
import {
    BranchOptionsDocument,
    BranchSettingsForBranchDocument,
    PriceTypeOptionsDocument,
    SetBranchSettingsDocument,
    UpdateWarehouseBranchAssignmentDocument,
    WarehousesDocument,
    type BranchSettingsFieldsFragment,
    type WarehouseFieldsFragment,
} from './generated/graphql';

export interface BranchOption {
    id: string;
    erpId: string;
    name: string;
}

export type Warehouse = WarehouseFieldsFragment;

export interface PriceTypeOption {
    id: string;
    code: string;
    name: string;
}

export type BranchSettings = BranchSettingsFieldsFragment;

export interface BranchSettingsInput {
    branchId: string;
    defaultPriceTypeId: string;
    visiblePriceTypeIds: string[] | null;
    defaultWarehouseId: string;
    visibleWarehouseIds: string[] | null;
}

// Warehouses are ERP org-structure master data (see access-control's Warehouse entity) — one
// row per physical/logical warehouse across all branches, expected to be a few dozen at most.
// No pagination/server-side filter is wired here, mirroring `branches`/`departments` above it in
// AccessControlResolver: a genuinely bounded org-structure list, not a row that accumulates over
// the business's lifetime (the backend-plugin-rules skill's Pagination section exemption test).
export async function fetchWarehouses(): Promise<Warehouse[]> {
    const result = await adminApi(WarehousesDocument);
    return result.warehouses;
}

export async function fetchBranchOptions(): Promise<BranchOption[]> {
    const result = await adminApi(BranchOptionsDocument);
    return result.branches;
}

export async function fetchPriceTypeOptions(): Promise<PriceTypeOption[]> {
    const result = await adminApi(PriceTypeOptionsDocument);
    return result.priceTypes;
}

export async function updateWarehouseBranchAssignment(
    warehouseId: string,
    branchId: string,
    includedInBranchAtp: boolean,
): Promise<Warehouse> {
    const result = await adminApi(UpdateWarehouseBranchAssignmentDocument, {
        warehouseId,
        branchId,
        includedInBranchAtp,
    });
    return result.updateWarehouseBranchAssignment;
}

export async function fetchBranchSettings(branchId: string): Promise<BranchSettings | null> {
    const result = await adminApi(BranchSettingsForBranchDocument, { branchId });
    return result.branchSettings ?? null;
}

export async function saveBranchSettings(input: BranchSettingsInput): Promise<BranchSettings> {
    const result = await adminApi(SetBranchSettingsDocument, { ...input });
    return result.setBranchSettings;
}
