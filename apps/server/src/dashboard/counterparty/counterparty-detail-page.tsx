import { useState } from 'react';
import { api, Badge, Page, PageBlock, PageLayout, PageTitle } from '@vendure/dashboard';
import { AnyRoute } from '@tanstack/react-router';

import { counterpartyDetailDocument } from './counterparty.graphql.js';
import { formatBranch, formatLinkStatus } from './counterparty-display.js';

interface CounterpartyDetail {
    id: string;
    erpId: string;
    legalName: string;
    shortName: string;
    inn: string | null;
    creditLimit: number | null;
    creditBalance: number | null;
    paymentDelayDays: number;
    priceType: string;
    isActive: boolean;
    assignedManagerId: string | null;
    managerErpId: string | null;
    linkedCustomerId: string | null;
    branchId: string | null;
    departmentId: string | null;
    erpGroupLabel: string | null;
    creditTermOverrideExtraDays: number | null;
    legalAddress: string | null;
    factualAddress: string | null;
    phone: string | null;
    officialEmail: string | null;
    tradingPoints: Array<{ id: string }>;
    teamMembers: Array<{ id: string }>;
}

// Read-only Counterparty detail page per issue #133 Phase 2. Every card here mirrors the
// corrected concept exactly — no edit affordance anywhere, since Counterparty is ERP-sourced
// only (see the issue's corrections 1 and 2). "Open Customer" is a plain link, not an "Unlink"
// action, per correction 1: the write path for unlinking belongs to issue #120.
export function CounterpartyDetailPage({ route }: Readonly<{ route: AnyRoute }>) {
    const { id } = route.useParams() as { id: string };
    const [counterparty, setCounterparty] = useState<CounterpartyDetail | null>(null);
    const [loaded, setLoaded] = useState(false);
    const [error, setError] = useState('');

    async function load(): Promise<void> {
        try {
            const data = await api.query(counterpartyDetailDocument, { id });
            setCounterparty((data.counterparty as CounterpartyDetail | null) ?? null);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not load counterparty');
        } finally {
            setLoaded(true);
        }
    }

    if (!loaded) {
        void load();
    }

    if (!loaded) {
        return null;
    }

    if (error || !counterparty) {
        return (
            <Page pageId="counterparty-detail">
                <PageTitle>Counterparty not found</PageTitle>
                <PageLayout>
                    <PageBlock column="main" blockId="error">
                        <p className="text-destructive">{error || 'This counterparty could not be found.'}</p>
                    </PageBlock>
                </PageLayout>
            </Page>
        );
    }

    const status = formatLinkStatus(counterparty.linkedCustomerId, counterparty.isActive);

    return (
        <Page pageId="counterparty-detail" entity={counterparty}>
            <PageTitle>{counterparty.shortName}</PageTitle>
            <PageLayout>
                <PageBlock column="main" blockId="general" title="General">
                    <Field label="Legal name" value={counterparty.legalName} />
                    <Field label="Short name" value={counterparty.shortName} />
                    <Field label="INN" value={counterparty.inn} />
                    <Field label="ERP ID" value={counterparty.erpId} muted />
                    <Field label="ERP group label" value={counterparty.erpGroupLabel} />
                    <div className="mt-2">
                        <Badge variant={counterparty.isActive ? 'secondary' : 'destructive'}>
                            {counterparty.isActive ? 'Active in ERP' : 'Inactive in ERP'}
                        </Badge>
                    </div>
                </PageBlock>

                <PageBlock column="main" blockId="contacts" title="Contacts & addresses">
                    <Field label="Phone" value={counterparty.phone} />
                    <Field label="Official email" value={counterparty.officialEmail} />
                    <Field label="Factual address" value={counterparty.factualAddress} />
                    <Field label="Legal address" value={counterparty.legalAddress} />
                </PageBlock>

                <PageBlock column="main" blockId="customer-binding" title="Customer binding">
                    {counterparty.linkedCustomerId ? (
                        <a
                            className="text-primary underline"
                            href={`/customers/${counterparty.linkedCustomerId}`}
                        >
                            Open Customer &#8599;
                        </a>
                    ) : (
                        <span className="text-muted-foreground">No linked Customer</span>
                    )}
                    <div className="mt-2">
                        <Badge variant={status === 'linked' ? 'secondary' : 'outline'}>
                            {status === 'erp-inactive' ? 'ERP inactive' : status === 'linked' ? 'Linked' : 'Unlinked'}
                        </Badge>
                    </div>
                </PageBlock>

                <PageBlock column="side" blockId="assignment" title="Assignment">
                    <Field label="Branch" value={formatBranch(counterparty.branchId)} />
                    <Field label="Department" value={counterparty.departmentId} />
                    <Field label="Assigned manager (Administrator id)" value={counterparty.assignedManagerId} />
                    <Field label="Manager ERP ID" value={counterparty.managerErpId} muted />
                </PageBlock>

                <PageBlock column="side" blockId="commercial-terms" title="Commercial terms">
                    <Field
                        label="Credit limit"
                        value={counterparty.creditLimit != null ? counterparty.creditLimit.toLocaleString() : 'Hidden'}
                    />
                    <Field
                        label="Credit balance"
                        value={
                            counterparty.creditBalance != null
                                ? counterparty.creditBalance.toLocaleString()
                                : 'Hidden'
                        }
                    />
                    <Field label="Payment delay" value={`${counterparty.paymentDelayDays} days`} />
                    <Field
                        label="Extra term override"
                        value={
                            counterparty.creditTermOverrideExtraDays != null
                                ? `+${counterparty.creditTermOverrideExtraDays} days`
                                : null
                        }
                    />
                    <Field label="Price type" value={counterparty.priceType} />
                </PageBlock>

                <PageBlock column="side" blockId="related-entities" title="Related entities">
                    <Field label="Trading points" value={String(counterparty.tradingPoints.length)} />
                    <Field label="Team members" value={String(counterparty.teamMembers.length)} />
                </PageBlock>
            </PageLayout>
        </Page>
    );
}

function Field({ label, value, muted }: Readonly<{ label: string; value: string | null | undefined; muted?: boolean }>) {
    return (
        <div className="mb-3">
            <div className="text-xs text-muted-foreground mb-1">{label}</div>
            <div className={muted ? 'text-muted-foreground' : undefined}>{value || '—'}</div>
        </div>
    );
}
