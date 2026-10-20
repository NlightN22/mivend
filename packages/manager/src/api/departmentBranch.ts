import { adminApi } from './client';
import {
    ClearDepartmentBranchDocument,
    DepartmentBranchOverviewDocument,
    SetDepartmentBranchDocument,
    type DepartmentBranchNodeFieldsFragment,
} from './generated/graphql';

export type DepartmentBranchNode = DepartmentBranchNodeFieldsFragment;

// The ERP department tree is bounded (hundreds of nodes) and edited as a whole: no server pagination.
export async function fetchDepartmentBranchOverview(): Promise<DepartmentBranchNode[]> {
    return (await adminApi(DepartmentBranchOverviewDocument)).departmentBranchOverview;
}

export async function setDepartmentBranch(
    departmentErpId: string,
    branchId: string,
): Promise<void> {
    await adminApi(SetDepartmentBranchDocument, { departmentErpId, branchId });
}

export async function clearDepartmentBranch(departmentErpId: string): Promise<void> {
    await adminApi(ClearDepartmentBranchDocument, { departmentErpId });
}
