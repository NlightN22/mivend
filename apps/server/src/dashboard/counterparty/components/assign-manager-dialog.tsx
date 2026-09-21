import { useState } from 'react';
import {
    api,
    Button,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    NativeSelect,
    NativeSelectOption,
} from '@vendure/dashboard';

import {
    administratorNamesForCounterpartyDocument,
    reassignCounterpartyManagerDocument,
} from '../counterparty.graphql.js';

export interface AssignManagerDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    counterpartyIds: string[];
    onSuccess: () => void;
}

interface AdministratorOption {
    id: string;
    name: string;
}

// Reuses the existing `reassignCounterpartyManager` mutation (already implemented and used by
// the manager portal) per issue #133 Phase 2 — no new backend mutation for this bulk action.
export function AssignManagerDialog({
    open,
    onOpenChange,
    counterpartyIds,
    onSuccess,
}: Readonly<AssignManagerDialogProps>) {
    const [administrators, setAdministrators] = useState<AdministratorOption[]>([]);
    const [loaded, setLoaded] = useState(false);
    const [selectedAdministratorId, setSelectedAdministratorId] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    async function loadAdministrators(): Promise<void> {
        const data = await api.query(administratorNamesForCounterpartyDocument, {
            options: { take: 999 },
        });
        setAdministrators(
            (data.administrators?.items ?? []).map(a => ({
                id: a.id,
                name: `${a.firstName} ${a.lastName}`,
            })),
        );
        setLoaded(true);
    }

    function handleOpenChange(nextOpen: boolean): void {
        if (nextOpen && !loaded) {
            void loadAdministrators();
        }
        onOpenChange(nextOpen);
    }

    async function handleAssign(): Promise<void> {
        if (!selectedAdministratorId) return;
        setSaving(true);
        setError('');
        try {
            await Promise.all(
                counterpartyIds.map(counterpartyId =>
                    api.mutate(reassignCounterpartyManagerDocument, {
                        counterpartyId,
                        administratorId: selectedAdministratorId,
                    }),
                ),
            );
            onOpenChange(false);
            onSuccess();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not assign manager');
        } finally {
            setSaving(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Assign manager</DialogTitle>
                    <DialogDescription>
                        Assign an administrator as manager for {counterpartyIds.length} selected
                        counterpart{counterpartyIds.length === 1 ? 'y' : 'ies'}.
                    </DialogDescription>
                </DialogHeader>
                <NativeSelect
                    value={selectedAdministratorId}
                    onChange={e => setSelectedAdministratorId(e.target.value)}
                >
                    <NativeSelectOption value="">Select an administrator...</NativeSelectOption>
                    {administrators.map(a => (
                        <NativeSelectOption key={a.id} value={a.id}>
                            {a.name}
                        </NativeSelectOption>
                    ))}
                </NativeSelect>
                {error && <p className="text-destructive text-sm">{error}</p>}
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                        Cancel
                    </Button>
                    <Button onClick={() => void handleAssign()} disabled={saving || !selectedAdministratorId}>
                        Assign
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
