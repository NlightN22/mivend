import { useRef, useState } from 'react';
import { AnyRoute } from '@tanstack/react-router';
import { ActionBarItem, Button, ListPage } from '@vendure/dashboard';
import { PlusIcon } from 'lucide-react';

import { AbbreviationDialog, EditableAbbreviation } from './abbreviation-dialog.js';
import { DeleteAbbreviationsBulkAction } from './abbreviation-bulk-actions.js';
import { legalNameAbbreviationListDocument } from './legal-name-abbreviations.graphql.js';

export function LegalNameAbbreviationsPage({ route }: { route: AnyRoute }) {
    const refreshRef = useRef<() => void>(() => {});
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editing, setEditing] = useState<EditableAbbreviation | null>(null);

    function openDialog(row: EditableAbbreviation | null): void {
        setEditing(row);
        setDialogOpen(true);
    }

    return (
        <>
            <ListPage
                pageId="legal-name-abbreviation-list"
                title="Legal name abbreviations"
                listQuery={legalNameAbbreviationListDocument}
                route={route}
                onSearchTermChange={searchTerm =>
                    searchTerm
                        ? {
                              phrase: { contains: searchTerm },
                              abbreviation: { contains: searchTerm },
                          }
                        : {}
                }
                transformVariables={variables => ({
                    options: { ...variables.options, filterOperator: 'OR' },
                })}
                defaultSort={[{ id: 'phrase', desc: false }]}
                defaultVisibility={{ phrase: true, abbreviation: true }}
                defaultColumnOrder={['phrase', 'abbreviation']}
                customizeColumns={{
                    phrase: {
                        header: 'Full phrase',
                        cell: ({ row }) => (
                            <Button
                                variant="link"
                                className="h-auto p-0"
                                onClick={() => openDialog(row.original)}
                            >
                                {row.original.phrase}
                            </Button>
                        ),
                    },
                }}
                bulkActions={[{ component: DeleteAbbreviationsBulkAction }]}
                registerRefresher={refresher => {
                    refreshRef.current = refresher;
                }}
            >
                <ActionBarItem itemId="create-button" requiresPermission={['UpdateSettings']}>
                    <Button onClick={() => openDialog(null)}>
                        <PlusIcon className="mr-2 h-4 w-4" />
                        New abbreviation
                    </Button>
                </ActionBarItem>
            </ListPage>
            <AbbreviationDialog
                open={dialogOpen}
                editing={editing}
                onOpenChange={setDialogOpen}
                onSaved={() => refreshRef.current()}
            />
        </>
    );
}
