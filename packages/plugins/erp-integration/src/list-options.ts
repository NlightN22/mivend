export const LIST_DEFAULT_TAKE = 20;
export const LIST_MAX_TAKE = 100;

export class InvalidListOptionsError extends Error {}

export interface ListOptionsInput {
    skip?: number | null;
    take?: number | null;
    sort?: Record<string, string | null> | null;
    filter?: Record<string, unknown> | null;
    filterOperator?: string | null;
}

export type ConditionOp = 'eq' | 'neq' | 'like' | 'nlike' | 'in' | 'nin' | 'isnull';

export type FilterNode =
    | { kind: 'cond'; column: string; op: ConditionOp; value: string | string[] | boolean }
    | { kind: 'group'; operator: 'AND' | 'OR'; children: FilterNode[] };

export interface SortSpec {
    column: string;
    direction: 'ASC' | 'DESC';
}

type FieldMap = Readonly<Record<string, string>>;

const OPERATORS = ['eq', 'notEq', 'contains', 'notContains', 'in', 'notIn', 'isNull'] as const;

function toOperator(raw: string | null | undefined): 'AND' | 'OR' {
    return raw === 'OR' ? 'OR' : 'AND';
}

function parseFieldCondition(field: string, column: string, spec: unknown): FilterNode[] {
    if (typeof spec !== 'object' || spec === null) {
        throw new InvalidListOptionsError(`Filter on "${field}" must be an operator object`);
    }
    const nodes: FilterNode[] = [];
    for (const [name, value] of Object.entries(spec)) {
        if (!(OPERATORS as readonly string[]).includes(name)) {
            throw new InvalidListOptionsError(`Unsupported operator "${name}" on "${field}"`);
        }
        if (value === undefined || value === null) continue;
        if (name === 'eq' && typeof value === 'string')
            nodes.push({ kind: 'cond', column, op: 'eq', value });
        else if (name === 'notEq' && typeof value === 'string')
            nodes.push({ kind: 'cond', column, op: 'neq', value });
        else if (name === 'contains' && typeof value === 'string')
            nodes.push({ kind: 'cond', column, op: 'like', value });
        else if (name === 'notContains' && typeof value === 'string')
            nodes.push({ kind: 'cond', column, op: 'nlike', value });
        else if (name === 'in' && Array.isArray(value))
            nodes.push({ kind: 'cond', column, op: 'in', value: value.map(String) });
        else if (name === 'notIn' && Array.isArray(value))
            nodes.push({ kind: 'cond', column, op: 'nin', value: value.map(String) });
        else if (name === 'isNull' && typeof value === 'boolean')
            nodes.push({ kind: 'cond', column, op: 'isnull', value });
        else throw new InvalidListOptionsError(`Invalid value for "${name}" on "${field}"`);
    }
    return nodes;
}

function parseGroup(
    filter: Record<string, unknown>,
    operator: 'AND' | 'OR',
    fields: FieldMap,
): FilterNode | null {
    const children: FilterNode[] = [];
    for (const [key, value] of Object.entries(filter)) {
        if (value === undefined || value === null) continue;
        if (key === '_and' || key === '_or') {
            if (!Array.isArray(value)) throw new InvalidListOptionsError(`"${key}" must be a list`);
            const nested = value
                .map(item => parseGroup(item as Record<string, unknown>, 'AND', fields))
                .filter((n): n is FilterNode => n !== null);
            if (nested.length > 0) {
                children.push({
                    kind: 'group',
                    operator: key === '_and' ? 'AND' : 'OR',
                    children: nested,
                });
            }
            continue;
        }
        const column = fields[key];
        if (!column) throw new InvalidListOptionsError(`Cannot filter on "${key}"`);
        children.push(...parseFieldCondition(key, column, value));
    }
    return children.length > 0 ? { kind: 'group', operator, children } : null;
}

export function parseFilter(options: ListOptionsInput, fields: FieldMap): FilterNode | null {
    if (!options.filter) return null;
    return parseGroup(options.filter, toOperator(options.filterOperator), fields);
}

export function parseSort(
    options: ListOptionsInput,
    fields: FieldMap,
    fallback: SortSpec,
): SortSpec[] {
    const specs: SortSpec[] = [];
    for (const [field, direction] of Object.entries(options.sort ?? {})) {
        if (!direction) continue;
        const column = fields[field];
        if (!column) throw new InvalidListOptionsError(`Cannot sort by "${field}"`);
        specs.push({ column, direction: direction === 'DESC' ? 'DESC' : 'ASC' });
    }
    return specs.length > 0 ? specs : [fallback];
}

export function parsePaging(options: ListOptionsInput): { skip: number; take: number } {
    const skip = Math.max(0, Math.trunc(options.skip ?? 0));
    const take = Math.min(
        LIST_MAX_TAKE,
        Math.max(1, Math.trunc(options.take ?? LIST_DEFAULT_TAKE)),
    );
    return { skip, take };
}

export function escapeLike(value: string): string {
    return value.replace(/[\\%_]/g, match => `\\${match}`);
}
