import { adminApi } from './client';

export interface BranchOption {
    id: string;
    erpId: string;
    name: string;
}

export interface Warehouse {
    id: string;
    erpId: string;
    name: string;
    branchId: string;
    isActive: boolean;
    includedInBranchAtp: boolean;
}

export interface PriceTypeOption {
    id: string;
    code: string;
    name: string;
}

export interface BranchSettings {
    id: string;
    branchId: string;
    defaultPriceTypeId: string;
    visiblePriceTypeIds: string[] | null;
    defaultWarehouseId: string;
    visibleWarehouseIds: string[] | null;
}

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
    const result = await adminApi<{ warehouses: Warehouse[] }>(
        `query Warehouses {
            warehouses {
                id
                erpId
                name
                branchId
                isActive
                includedInBranchAtp
            }
        }`,
    );
    return result.warehouses;
}

export async function fetchBranchOptions(): Promise<BranchOption[]> {
    const result = await adminApi<{ branches: BranchOption[] }>(
        `query BranchOptions { branches { id erpId name } }`,
    );
    return result.branches;
}

export async function fetchPriceTypeOptions(): Promise<PriceTypeOption[]> {
    const result = await adminApi<{ priceTypes: PriceTypeOption[] }>(
        `query PriceTypeOptions { priceTypes { id code name } }`,
    );
    return result.priceTypes;
}

export async function updateWarehouseBranchAssignment(
    warehouseId: string,
    branchId: string,
    includedInBranchAtp: boolean,
): Promise<Warehouse> {
    const result = await adminApi<{ updateWarehouseBranchAssignment: Warehouse }>(
        `mutation UpdateWarehouseBranchAssignment(
            $warehouseId: ID!
            $branchId: String!
            $includedInBranchAtp: Boolean!
        ) {
            updateWarehouseBranchAssignment(
                warehouseId: $warehouseId
                branchId: $branchId
                includedInBranchAtp: $includedInBranchAtp
            ) {
                id
                erpId
                name
                branchId
                isActive
                includedInBranchAtp
            }
        }`,
        { warehouseId, branchId, includedInBranchAtp },
    );
    return result.updateWarehouseBranchAssignment;
}

export async function fetchBranchSettings(branchId: string): Promise<BranchSettings | null> {
    const result = await adminApi<{ branchSettings: BranchSettings | null }>(
        `query BranchSettingsForBranch($branchId: String!) {
            branchSettings(branchId: $branchId) {
                id
                branchId
                defaultPriceTypeId
                visiblePriceTypeIds
                defaultWarehouseId
                visibleWarehouseIds
            }
        }`,
        { branchId },
    );
    return result.branchSettings;
}

export async function saveBranchSettings(input: BranchSettingsInput): Promise<BranchSettings> {
    const result = await adminApi<{ setBranchSettings: BranchSettings }>(
        `mutation SetBranchSettings(
            $branchId: String!
            $defaultPriceTypeId: String!
            $visiblePriceTypeIds: [String!]
            $defaultWarehouseId: String!
            $visibleWarehouseIds: [String!]
        ) {
            setBranchSettings(
                branchId: $branchId
                defaultPriceTypeId: $defaultPriceTypeId
                visiblePriceTypeIds: $visiblePriceTypeIds
                defaultWarehouseId: $defaultWarehouseId
                visibleWarehouseIds: $visibleWarehouseIds
            ) {
                id
                branchId
                defaultPriceTypeId
                visiblePriceTypeIds
                defaultWarehouseId
                visibleWarehouseIds
            }
        }`,
        { ...input },
    );
    return result.setBranchSettings;
}
