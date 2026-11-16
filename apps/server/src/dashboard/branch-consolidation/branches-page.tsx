import { useEffect, useState } from 'react';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    Badge,
    Button,
    Input,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
    api,
} from '@vendure/dashboard';

import {
    createBranchDocument,
    listBranchesDocument,
    renameBranchDocument,
    setDefaultBranchDocument,
} from './branches.graphql.js';
import {
    DEFAULT_BRANCH_CONSEQUENCES,
    DEFAULT_BRANCH_EXPLANATION,
    buildSetDefaultMessage,
} from './default-branch-consequences.js';

// SuperAdmin-only utility page (issue #80 follow-up) — deliberately NOT in the manager portal: the
// mutations are gated by Permission.SuperAdmin, and the default branch (#286) changes what guests see.
interface BranchRow {
    id: string;
    erpId: string;
    name: string;
    isDefault: boolean;
}

export function BranchesPage() {
    const [branches, setBranches] = useState<BranchRow[]>([]);
    const [loaded, setLoaded] = useState(false);
    const [name, setName] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
    const [makeDefault, setMakeDefault] = useState<BranchRow | null>(null);

    async function load(): Promise<void> {
        const data = await api.query(listBranchesDocument);
        setBranches(data.branches ?? []);
        setLoaded(true);
    }
    useEffect(() => {
        void load();
    }, []);

    async function run(action: () => Promise<unknown>, fallback: string): Promise<boolean> {
        setSaving(true);
        setError('');
        try {
            await action();
            await load();
            return true;
        } catch (e) {
            setError(e instanceof Error ? e.message : fallback);
            return false;
        } finally {
            setSaving(false);
        }
    }

    async function onCreate(): Promise<void> {
        const trimmed = name.trim();
        if (!trimmed) return;
        if (
            await run(
                () => api.mutate(createBranchDocument, { name: trimmed }),
                'Could not create branch',
            )
        ) {
            setName('');
        }
    }

    async function onRename(): Promise<void> {
        if (!renaming || !renaming.name.trim()) return;
        const { id, name: next } = renaming;
        if (
            await run(
                () => api.mutate(renameBranchDocument, { branchId: id, name: next }),
                'Could not rename branch',
            )
        ) {
            setRenaming(null);
        }
    }

    async function onMakeDefault(): Promise<void> {
        if (!makeDefault) return;
        const target = makeDefault;
        setMakeDefault(null);
        await run(
            () => api.mutate(setDefaultBranchDocument, { branchId: target.id }),
            'Could not set the default branch',
        );
    }

    const currentDefault = branches.find(b => b.isDefault) ?? null;

    return (
        <div className="p-6 max-w-3xl">
            <h1 className="text-xl font-semibold mb-1">Branches</h1>
            <p className="text-muted-foreground mb-2">
                mivend's own branch consolidation — independent of any ERP data. Assigning
                warehouses to a branch is a manager-portal task (Settings → Branches); creating,
                renaming and choosing the default branch stay here, restricted to SuperAdmin.
            </p>
            <p className="text-muted-foreground mb-5">
                {DEFAULT_BRANCH_EXPLANATION} The default branch can be moved but never cleared.
            </p>

            {error && <div className="text-destructive mb-3">{error}</div>}
            {loaded && !currentDefault && branches.length > 0 && (
                <div className="text-destructive mb-3">
                    No default branch is set. Choose one below.
                </div>
            )}

            <div className="flex gap-2 mb-6">
                <Input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Branch name"
                    disabled={saving}
                    onKeyDown={e => {
                        if (e.key === 'Enter') void onCreate();
                    }}
                />
                <Button onClick={() => void onCreate()} disabled={saving || !name.trim()}>
                    Add branch
                </Button>
            </div>

            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>erpId</TableHead>
                        <TableHead />
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {branches.map(b => (
                        <TableRow key={b.id}>
                            <TableCell>
                                {renaming?.id === b.id ? (
                                    <Input
                                        value={renaming.name}
                                        onChange={e =>
                                            setRenaming({ id: b.id, name: e.target.value })
                                        }
                                        onKeyDown={e => {
                                            if (e.key === 'Enter') void onRename();
                                        }}
                                        disabled={saving}
                                        className="h-8"
                                    />
                                ) : (
                                    <span className="flex items-center gap-2">
                                        {b.name}
                                        {b.isDefault && <Badge variant="secondary">Default</Badge>}
                                    </span>
                                )}
                            </TableCell>
                            <TableCell className="text-muted-foreground font-mono">
                                {b.erpId}
                            </TableCell>
                            <TableCell>
                                <div className="flex gap-2 justify-end">
                                    {renaming?.id === b.id ? (
                                        <>
                                            <Button
                                                size="sm"
                                                onClick={() => void onRename()}
                                                disabled={saving || !renaming.name.trim()}
                                            >
                                                Save
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => setRenaming(null)}
                                            >
                                                Cancel
                                            </Button>
                                        </>
                                    ) : (
                                        <>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() =>
                                                    setRenaming({ id: b.id, name: b.name })
                                                }
                                                disabled={saving}
                                            >
                                                Rename
                                            </Button>
                                            {!b.isDefault && (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => setMakeDefault(b)}
                                                    disabled={saving}
                                                >
                                                    Make default
                                                </Button>
                                            )}
                                        </>
                                    )}
                                </div>
                            </TableCell>
                        </TableRow>
                    ))}
                    {loaded && branches.length === 0 && (
                        <TableRow>
                            <TableCell colSpan={3} className="text-muted-foreground">
                                No branches yet.
                            </TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>

            <AlertDialog open={makeDefault !== null} onOpenChange={o => !o && setMakeDefault(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Change the default branch</AlertDialogTitle>
                        <AlertDialogDescription>
                            {makeDefault &&
                                buildSetDefaultMessage(
                                    makeDefault.name,
                                    currentDefault?.name ?? null,
                                )}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <ul className="list-disc pl-5 text-sm text-muted-foreground">
                        {DEFAULT_BRANCH_CONSEQUENCES.map(line => (
                            <li key={line}>{line}</li>
                        ))}
                    </ul>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => void onMakeDefault()}>
                            Make default
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
