import { useState } from 'react';
import {
    api,
    graphql,
    Badge,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@vendure/dashboard';

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
        <div className="p-6">
            <h1 className="text-xl font-semibold mb-1">Organizations</h1>
            <p className="text-muted-foreground mb-4 max-w-2xl">
                Read-only view of counterparty organization requisites synced from the ERP. Same
                data as the manager portal's Settings → Organizations page.
            </p>

            {loaded && organizations.length === 0 && (
                <p className="text-muted-foreground">No organizations yet.</p>
            )}

            {organizations.length > 0 && (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Legal name</TableHead>
                            <TableHead>ERP id</TableHead>
                            <TableHead>Active</TableHead>
                            <TableHead>Requisites complete</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {organizations.map(org => (
                            <TableRow key={org.id}>
                                <TableCell>{org.legalName}</TableCell>
                                <TableCell className="font-mono text-muted-foreground">
                                    {org.erpId}
                                </TableCell>
                                <TableCell>
                                    <Badge variant={org.isActive ? 'secondary' : 'outline'}>
                                        {org.isActive ? 'Yes' : 'No'}
                                    </Badge>
                                </TableCell>
                                <TableCell>
                                    <Badge variant={org.hasCompleteRequisites ? 'secondary' : 'outline'}>
                                        {org.hasCompleteRequisites ? 'Yes' : 'No'}
                                    </Badge>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            )}
        </div>
    );
}
