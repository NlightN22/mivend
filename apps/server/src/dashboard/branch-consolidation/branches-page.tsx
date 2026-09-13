import { useState } from 'react';
import { api, graphql } from '@vendure/dashboard';

// SuperAdmin-only utility page (issue #80 follow-up) — deliberately NOT in the manager portal.
// createBranch/branches are gated by Permission.SuperAdmin on the resolver, not the broader
// ManageAccessControl used elsewhere in this same plugin (setCreditTermLimit,
// setRoleAccessScopeConfig) — those are legitimate day-to-day manager-portal business settings;
// this is the org-structure precondition that blocks warehouse ingestion entirely for the whole
// system if misused, so it stays on the tool actual staff don't casually click around in. See
// ../branch-consolidation/index.ts's alert, which links here.
const listBranchesDocument = graphql(`
    query ListBranchesForConsolidationPage {
        branches {
            id
            erpId
            name
        }
    }
`);

const createBranchDocument = graphql(`
    mutation CreateBranchFromDashboard($name: String!) {
        createBranch(name: $name) {
            id
            erpId
            name
        }
    }
`);

export function BranchesPage() {
    const [branches, setBranches] = useState<Array<{ id: string; erpId: string; name: string }>>(
        [],
    );
    const [loaded, setLoaded] = useState(false);
    const [name, setName] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    async function load(): Promise<void> {
        const data = await api.query(listBranchesDocument);
        setBranches(data.branches ?? []);
        setLoaded(true);
    }
    if (!loaded) {
        void load();
    }

    async function onCreate(): Promise<void> {
        const trimmed = name.trim();
        if (!trimmed) return;
        setSaving(true);
        setError('');
        try {
            await api.mutate(createBranchDocument, { name: trimmed });
            setName('');
            await load();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not create branch');
        } finally {
            setSaving(false);
        }
    }

    return (
        <div style={{ padding: 24, maxWidth: 560 }}>
            <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>Branches</h1>
            <p style={{ color: '#666', marginBottom: 20 }}>
                mivend's own branch consolidation — independent of any ERP data. Assigning
                warehouses to a branch is a manager-portal task (Settings → Branches); creating
                the branch itself stays here, restricted to SuperAdmin.
            </p>

            {error && (
                <div style={{ color: '#b91c1c', marginBottom: 12 }}>{error}</div>
            )}

            <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
                <input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Branch name"
                    disabled={saving}
                    onKeyDown={e => {
                        if (e.key === 'Enter') void onCreate();
                    }}
                    style={{ flex: 1, padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6 }}
                />
                <button
                    onClick={() => void onCreate()}
                    disabled={saving || !name.trim()}
                    style={{
                        padding: '6px 14px',
                        borderRadius: 6,
                        background: '#111827',
                        color: 'white',
                        border: 'none',
                    }}
                >
                    Add branch
                </button>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                    <tr style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>
                        <th style={{ padding: '6px 0' }}>Name</th>
                        <th style={{ padding: '6px 0' }}>erpId</th>
                    </tr>
                </thead>
                <tbody>
                    {branches.map(b => (
                        <tr key={b.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                            <td style={{ padding: '6px 0' }}>{b.name}</td>
                            <td style={{ padding: '6px 0', color: '#6b7280', fontFamily: 'monospace' }}>
                                {b.erpId}
                            </td>
                        </tr>
                    ))}
                    {branches.length === 0 && (
                        <tr>
                            <td colSpan={2} style={{ padding: '12px 0', color: '#6b7280' }}>
                                No branches yet.
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
}
