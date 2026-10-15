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
    packagesOnly: boolean;
    enforceMultiplicity: boolean;
    allowExceedingCreditLimit: boolean;
    prepaymentReserveDays: number;
    proformaPaymentTermDays: number;
}

// Unpaginated on purpose: warehouses are bounded org-structure master data (a few dozen rows),
// not a growing table, so no pagination or server-side filter; same as branches/departments.
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
