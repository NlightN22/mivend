import { graphql } from '@vendure/dashboard';

export const listBranchesDocument = graphql(`
    query ListBranchesForConsolidationPage {
        branches {
            id
            erpId
            name
            isDefault
        }
    }
`);

export const branchListDocument = graphql(`
    query BranchListForDashboard($options: BranchListOptions) {
        branchList(options: $options) {
            items {
                id
                createdAt
                updatedAt
                erpId
                name
                isDefault
            }
            totalItems
        }
    }
`);

export const createBranchDocument = graphql(`
    mutation CreateBranchFromDashboard($name: String!) {
        createBranch(name: $name) {
            id
        }
    }
`);

export const renameBranchDocument = graphql(`
    mutation RenameBranchFromDashboard($branchId: ID!, $name: String!) {
        renameBranch(branchId: $branchId, name: $name) {
            id
        }
    }
`);

export const setDefaultBranchDocument = graphql(`
    mutation SetDefaultBranchFromDashboard($branchId: ID!) {
        setDefaultBranch(branchId: $branchId) {
            id
        }
    }
`);
