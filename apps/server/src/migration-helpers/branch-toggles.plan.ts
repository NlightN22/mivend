// Not in migrations/: TypeORM instantiates every export of a file the migrations glob matches.
export interface BranchFlags {
    branchId: string;
    multiplicity: boolean;
    exceeding: boolean;
}

export interface PolicyRowPlan {
    code: string;
    stage: string;
    branchId: string | null;
    consequence: string;
    enabled: boolean;
}

// Global rows carry the global-default branch's flags (both false without one); a branch gets an
// override per check only where its flag differs. `credit.limit` at `checkout`: hold = the over-limit
// order waits for a manager (flag off, the old default), warn = it goes on after the customer acknowledges.
export function planPolicyRows(
    globalDefault: BranchFlags | null,
    branches: BranchFlags[],
): PolicyRowPlan[] {
    const global = {
        multiplicity: globalDefault?.multiplicity === true,
        exceeding: globalDefault?.exceeding === true,
    };
    const multiplicity = (branchId: string | null, enabled: boolean): PolicyRowPlan[] =>
        [
            ['cart', 'block'],
            ['pre-reserve', 'hold'],
            ['on-edit', 'warn'],
        ].map(([stage, consequence]) => ({
            code: 'order.multiplicity',
            stage,
            branchId,
            consequence,
            enabled,
        }));
    const credit = (branchId: string | null, exceeding: boolean): PolicyRowPlan[] => [
        {
            code: 'credit.limit',
            stage: 'checkout',
            branchId,
            consequence: exceeding ? 'warn' : 'hold',
            enabled: true,
        },
        { code: 'credit.limit', stage: 'on-edit', branchId, consequence: 'warn', enabled: true },
    ];
    const plan = [...multiplicity(null, global.multiplicity), ...credit(null, global.exceeding)];
    for (const branch of branches) {
        if (branch.multiplicity !== global.multiplicity)
            plan.push(...multiplicity(branch.branchId, branch.multiplicity));
        if (branch.exceeding !== global.exceeding)
            plan.push(...credit(branch.branchId, branch.exceeding));
    }
    return plan;
}
