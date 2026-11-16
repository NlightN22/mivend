export const DEFAULT_BRANCH_EXPLANATION =
    'The default branch is the fallback for everyone without a branch of their own.';

export const DEFAULT_BRANCH_CONSEQUENCES: readonly string[] = [
    'Guests, and customers whose counterparty has no branch, get its price type, warehouse and stock.',
    'Staff without a branch, or whose branch has no settings, get its settings.',
    'Orders and trading points of a counterparty without a branch are placed in it, but staff limited to a department or branch do not see them: only roles with scope "all" do.',
];

export function buildSetDefaultMessage(branchName: string, currentName: string | null): string {
    const from = currentName ? ` from "${currentName}"` : '';
    return `Make "${branchName}" the default branch${from}?`;
}
