import { useCallback, useEffect, useRef, useState } from 'react';
import { AnyRoute } from '@tanstack/react-router';
import { ActionBarItem, api, Badge, Button, ListPage } from '@vendure/dashboard';
import { PlusIcon } from 'lucide-react';

import { BranchNameDialog } from './branch-name-dialog.js';
import { branchListDocument, listBranchesDocument } from './branches.graphql.js';
import { SetDefaultBranchDialog } from './set-default-branch-dialog.js';

interface BranchTarget {
    id: string;
    name: string;
}

// SuperAdmin-only utility page (issue #80 follow-up): the mutations are gated by Permission.SuperAdmin,
// and the default branch (#286) changes what guests see.
export function BranchesPage({ route }: { route: AnyRoute }) {
    const refreshRef = useRef<() => void>(() => {});
    const [nameDialogOpen, setNameDialogOpen] = useState(false);
    const [renaming, setRenaming] = useState<BranchTarget | null>(null);
    const [makeDefault, setMakeDefault] = useState<BranchTarget | null>(null);
    const [currentDefault, setCurrentDefault] = useState<string | null>(null);

    const loadDefault = useCallback(async (): Promise<void> => {
        const data = await api.query(listBranchesDocument);
        setCurrentDefault(data.branches?.find(b => b.isDefault)?.name ?? null);
    }, []);
    useEffect(() => {
        void loadDefault();
    }, [loadDefault]);

    function openNameDialog(target: BranchTarget | null): void {
        setRenaming(target);
        setNameDialogOpen(true);
    }

    function refresh(): void {
        refreshRef.current();
        void loadDefault();
    }

    return (
        <>
            <ListPage
                pageId="branch-list"
                title="Branches"
                listQuery={branchListDocument}
                route={route}
                onSearchTermChange={searchTerm =>
                    searchTerm ? { name: { contains: searchTerm } } : {}
                }
                defaultSort={[{ id: 'name', desc: false }]}
                defaultVisibility={{ name: true, erpId: true, isDefault: true }}
                defaultColumnOrder={['name', 'erpId', 'isDefault', 'actions']}
                customizeColumns={{
                    isDefault: {
                        header: 'Default',
                        enableSorting: false,
                        cell: ({ row }) =>
                            row.original.isDefault ? (
                                <Badge variant="secondary">Default</Badge>
                            ) : null,
                    },
                    erpId: {
                        header: 'erpId',
                        cell: ({ row }) => (
                            <span className="text-muted-foreground font-mono">
                                {row.original.erpId}
                            </span>
                        ),
                    },
                }}
                additionalColumns={{
                    actions: {
                        header: '',
                        enableSorting: false,
                        cell: ({ row }) => (
                            <div className="flex justify-end gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                        openNameDialog({
                                            id: row.original.id,
                                            name: row.original.name,
                                        })
                                    }
                                >
                                    Rename
                                </Button>
                                {!row.original.isDefault && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() =>
                                            setMakeDefault({
                                                id: row.original.id,
                                                name: row.original.name,
                                            })
                                        }
                                    >
                                        Make default
                                    </Button>
                                )}
                            </div>
                        ),
                    },
                }}
                includeSelectionColumn={false}
                registerRefresher={refresher => {
                    refreshRef.current = refresher;
                }}
            >
                <ActionBarItem itemId="create-button" requiresPermission={['SuperAdmin']}>
                    <Button onClick={() => openNameDialog(null)}>
                        <PlusIcon className="mr-2 h-4 w-4" />
                        New branch
                    </Button>
                </ActionBarItem>
            </ListPage>
            <BranchNameDialog
                open={nameDialogOpen}
                editing={renaming}
                onOpenChange={setNameDialogOpen}
                onSaved={refresh}
            />
            <SetDefaultBranchDialog
                target={makeDefault}
                currentDefaultName={currentDefault}
                onClose={() => setMakeDefault(null)}
                onSaved={refresh}
            />
        </>
    );
}
