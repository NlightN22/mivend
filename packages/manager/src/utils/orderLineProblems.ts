import type { FindingConsequence } from './findingConsequence';
import type { OrderCheckFinding } from './orderCheckMessages';
import { BELOW_FLOOR_CODE, CONTRACT_CODE, STOCK_CODE, listedFindings } from './orderLineChecks';
import type { OrderLineRow } from './orderLineRows';

export type ProblemTone = 'danger' | 'orange' | 'warning';
export type CellKey = 'qty' | 'available' | 'reserve' | 'price' | 'discount';
export type Stripe = ProblemTone | 'ok';

export interface CellProblem {
    tone: ProblemTone;
    findings: OrderCheckFinding[];
    notes: string[];
}

export interface LineProblems {
    cells: Partial<Record<CellKey, CellProblem>>;
    stripe: Stripe;
}

const RANK: Record<ProblemTone, number> = { danger: 3, orange: 2, warning: 1 };

export function worstTone(tones: ProblemTone[]): ProblemTone | null {
    return tones.reduce<ProblemTone | null>(
        (worst, tone) => (worst === null || RANK[tone] > RANK[worst] ? tone : worst),
        null,
    );
}

// Policy consequence first (branch overrides already applied); without one the check's own severity decides.
export function findingTone(
    finding: OrderCheckFinding,
    consequences: Map<string, FindingConsequence>,
): ProblemTone {
    const consequence = consequences.get(finding.id)?.consequence;
    if (consequence === 'hold' || consequence === 'block') return 'danger';
    if (consequence === 'require-approval') return 'orange';
    if (consequence) return 'warning';
    return finding.severity === 'error' ? 'danger' : 'warning';
}

function cell(
    findings: OrderCheckFinding[],
    consequences: Map<string, FindingConsequence>,
    notes: Array<{ tone: ProblemTone; text: string }>,
): CellProblem | null {
    const tone = worstTone([
        ...findings.map(f => findingTone(f, consequences)),
        ...notes.map(n => n.tone),
    ]);
    return tone ? { tone, findings, notes: notes.map(n => n.text) } : null;
}

export function lineProblems(
    row: OrderLineRow,
    consequences: Map<string, FindingConsequence>,
): LineProblems {
    const of = (codes: string[]): OrderCheckFinding[] =>
        row.findings.filter(f => codes.includes(f.checkCode));
    const stockNote =
        row.view.stockShort && !of([STOCK_CODE]).length
            ? [
                  {
                      tone: 'danger' as const,
                      text: `Not enough stock: ${row.view.available ?? 0} available, ${row.view.needed} needed`,
                  },
              ]
            : [];
    const cells: LineProblems['cells'] = {};
    const entries: Array<[CellKey, CellProblem | null]> = [
        ['qty', cell(listedFindings(row.findings), consequences, [])],
        ['available', cell(of([STOCK_CODE, CONTRACT_CODE]), consequences, stockNote)],
        [
            'reserve',
            cell(
                [],
                consequences,
                row.reserveShort
                    ? [
                          {
                              tone: 'warning',
                              text: `Reserved ${row.reserved} of ${row.view.needed}; stock for the rest is not held`,
                          },
                      ]
                    : [],
            ),
        ],
        [
            'price',
            cell(
                of([BELOW_FLOOR_CODE]),
                consequences,
                row.adjustment?.label === 'Pending approval'
                    ? [{ tone: 'orange', text: 'The price change waits for approval' }]
                    : [],
            ),
        ],
        [
            'discount',
            cell(
                [],
                consequences,
                row.discountOverLimit
                    ? [
                          {
                              tone: 'orange',
                              text: `Discount above the allowed maximum (max ${row.maxDiscountPercent}%)`,
                          },
                      ]
                    : [],
            ),
        ],
    ];
    for (const [key, problem] of entries) if (problem) cells[key] = problem;
    const stripe = worstTone(Object.values(cells).map(c => c.tone)) ?? 'ok';
    return { cells, stripe };
}

// Findings about the order itself (credit, contract, export data), shown by the total.
export function orderLevelProblem(
    findings: OrderCheckFinding[],
    consequences: Map<string, FindingConsequence>,
): CellProblem | null {
    return cell(
        findings.filter(f => !f.lineRef),
        consequences,
        [],
    );
}
