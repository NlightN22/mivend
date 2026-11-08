import { registerMock } from '../../../.storybook/graphql-mock-registry';
import { paginate } from '../../../.storybook/mock-list-utils';

interface RequestMock {
    id: string;
    requestType: string;
    status: string;
    currentStepIndex: number;
    currentStepRole: string | null;
    stepRoles: string[];
    totalSteps: number;
    requestedByAdministratorId: string;
    createdAt: string;
    decidedAt: string | null;
    payload: string;
    steps: unknown[];
}

interface MockOptions {
    take?: number;
    skip?: number;
    search?: string;
    requestTypes?: string[];
    statuses?: string[];
    requestedByAdministratorId?: string;
}

function request(
    id: string,
    requestType: string,
    status: string,
    payload: Record<string, unknown>,
): RequestMock {
    return {
        id,
        requestType,
        status,
        currentStepIndex: 0,
        currentStepRole: status === 'pending' ? 'DepartmentHead' : null,
        stepRoles: ['DepartmentHead', 'GeneralDirector'],
        totalSteps: 2,
        requestedByAdministratorId: '1',
        createdAt: new Date(Date.UTC(2026, 10, 1 + Number(id))).toISOString(),
        decidedAt: status === 'pending' ? null : new Date().toISOString(),
        payload: JSON.stringify(payload),
        steps: [],
    };
}

export const APPROVAL_MOCKS = [
    request('1', 'discountGrantApproval', 'pending', {
        priceTypeCode: 'price-type-wholesale',
        facetValueCode: null,
        percent: 7,
    }),
    request('2', 'priceAdjustmentApproval', 'pending', { orderId: '1', requestedPrice: 9000 }),
    request('3', 'creditTermApproval', 'approved', {
        counterpartyErpId: 'customer-123',
        requestedExtraDays: 14,
    }),
    request('4', 'priceAdjustmentApproval', 'rejected', { orderId: '1', requestedPrice: 5000 }),
];

function narrow(items: RequestMock[], o?: MockOptions): RequestMock[] {
    return items
        .filter(r => !o?.requestTypes?.length || o.requestTypes.includes(r.requestType))
        .filter(r => !o?.statuses?.length || o.statuses.includes(r.status))
        .filter(r => !o?.search || r.id.includes(o.search))
        .filter(
            r =>
                !o?.requestedByAdministratorId ||
                r.requestedByAdministratorId === o.requestedByAdministratorId,
        );
}

export function mockApprovalsList(items: RequestMock[] = APPROVAL_MOCKS): void {
    registerMock('TeamMembers', () => ({
        teamMembers: [{ id: '1', firstName: 'Alex', lastName: 'Manager', roleCodes: ['manager'] }],
    }));
    registerMock(
        'ApprovalsInbox',
        (v: {
            awaitingOptions?: MockOptions;
            allInvolvedOptions?: MockOptions;
            mineOptions?: MockOptions;
        }) => ({
            myApprovalsInbox: {
                awaitingMyDecision: paginate(
                    narrow(
                        items.filter(r => r.status === 'pending'),
                        v.awaitingOptions,
                    ),
                    v.awaitingOptions,
                ),
                allInvolved: paginate(narrow(items, v.allInvolvedOptions), v.allInvolvedOptions),
            },
            mine: { allInvolved: paginate(narrow(items, v.mineOptions), v.mineOptions) },
        }),
    );
    registerMock('ApprovalOrderReferences', () => ({ visibleOrders: { items: [] } }));
    registerMock('ApprovalCounterparties', () => ({
        counterparties: { items: [{ erpId: 'customer-123', shortName: 'customer-123' }] },
    }));
    registerMock('TableViews', () => ({ tableViews: [] }));
}
