import { useState } from 'react';
import { api, graphql } from '@vendure/dashboard';

// Read-only companion to packages/manager's Settings → Organizations page (issue #88 part 2,
// commit 3894048) — same underlying `organizationRequisites` query, no create/edit here either.
// v1 is deliberately read-only across both frontends: no general organizations CRUD admin
// surface yet.
const listOrganizationRequisitesDocument = graphql(`
    query ListOrganizationRequisitesForDashboard {
        organizationRequisites {
            id
            erpId
            legalName
            isActive
            hasCompleteRequisites
        }
    }
`);

interface OrganizationRequisitesRow {
    id: string;
    erpId: string;
    legalName: string;
    isActive: boolean;
    hasCompleteRequisites: boolean;
}

export function OrganizationsPage() {
    const [organizations, setOrganizations] = useState<OrganizationRequisitesRow[]>([]);
    const [loaded, setLoaded] = useState(false);

    async function load(): Promise<void> {
        const data = await api.query(listOrganizationRequisitesDocument);
        setOrganizations(data.organizationRequisites ?? []);
        setLoaded(true);
    }
    if (!loaded) {
        void load();
    }

    return (
        <div style={{ padding: 24, maxWidth: 720 }}>
            <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>Organizations</h1>
            <p style={{ color: '#666', marginBottom: 20 }}>
                Read-only view of counterparty organization requisites synced from the ERP. Same
                data as the manager portal's Settings → Organizations page.
            </p>

            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                <colgroup>
                    <col style={{ width: '34%' }} />
                    <col style={{ width: '30%' }} />
                    <col style={{ width: '16%' }} />
                    <col style={{ width: '20%' }} />
                </colgroup>
                <thead>
                    <tr style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>
                        <th style={{ padding: '6px 16px 6px 0' }}>Legal name</th>
                        <th style={{ padding: '6px 16px 6px 0' }}>ERP id</th>
                        <th style={{ padding: '6px 16px 6px 0' }}>Active</th>
                        <th style={{ padding: '6px 0' }}>Requisites complete</th>
                    </tr>
                </thead>
                <tbody>
                    {organizations.map(org => (
                        <tr key={org.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                            <td
                                style={{
                                    padding: '6px 16px 6px 0',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                }}
                                title={org.legalName}
                            >
                                {org.legalName}
                            </td>
                            <td
                                style={{
                                    padding: '6px 16px 6px 0',
                                    color: '#6b7280',
                                    fontFamily: 'monospace',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                }}
                                title={org.erpId}
                            >
                                {org.erpId}
                            </td>
                            <td style={{ padding: '6px 16px 6px 0' }}>{org.isActive ? 'Yes' : 'No'}</td>
                            <td style={{ padding: '6px 0' }}>
                                {org.hasCompleteRequisites ? 'Yes' : 'No'}
                            </td>
                        </tr>
                    ))}
                    {loaded && organizations.length === 0 && (
                        <tr>
                            <td colSpan={4} style={{ padding: '12px 0', color: '#6b7280' }}>
                                No organizations yet.
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
}
