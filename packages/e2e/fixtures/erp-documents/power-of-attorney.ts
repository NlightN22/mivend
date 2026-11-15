import { clientErpId, type ClientKey } from '../visibility/plan';

export interface PowerOfAttorneyPlan {
    number: string;
    client: ClientKey;
    holder: string;
    validUntilOffsetDays: number;
    scanId?: string;
    contractDeleted?: boolean;
}

export const POWERS_OF_ATTORNEY: PowerOfAttorneyPlan[] = [
    {
        number: 'E2E-POA-0001',
        client: 'a-own',
        holder: 'E2E Holder Active',
        validUntilOffsetDays: 90,
        scanId: 'e2e-scan-1',
    },
    {
        number: 'E2E-POA-0002',
        client: 'a-own',
        holder: 'E2E Holder Expired',
        validUntilOffsetDays: -30,
    },
    {
        number: 'E2E-POA-0003',
        client: 'a-own',
        holder: 'E2E Holder Gone',
        validUntilOffsetDays: 90,
        contractDeleted: true,
    },
    { number: 'E2E-POA-0004', client: 'b-own', holder: 'E2E Holder B', validUntilOffsetDays: 90 },
];

export const POA_PATH = '/documents/powers-of-attorney';
export const POA_TITLE = 'Powers of attorney';
export const POA_NUMBER_PREFIX = 'E2E-POA-';

const LITERAL = (value: string): string => `'${value.replace(/'/g, "''")}'`;

export function powerOfAttorneySql(): string {
    const rows = POWERS_OF_ATTORNEY.map(
        p =>
            `(${LITERAL(`${clientErpId(p.client)}-contract`)}, ${LITERAL(p.number)}, ${LITERAL(p.holder)}, now() - interval '30 days', now() + interval '${p.validUntilOffsetDays} days', ${p.scanId ? LITERAL(p.scanId) : 'NULL'}, ${Boolean(p.contractDeleted)})`,
    );
    return [
        `DELETE FROM contract_power_of_attorney_erp WHERE number LIKE '${POA_NUMBER_PREFIX}%';`,
        `INSERT INTO contract_power_of_attorney_erp ("contractId", number, "holderName", "issueDate", "validUntil", "scanId", "isDeleted") VALUES ${rows.join(',\n')};`,
    ].join('\n');
}
