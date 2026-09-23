import { useEffect, useState } from 'react';
import {
    api,
    Button,
    Checkbox,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    Label,
    NativeSelect,
    NativeSelectOption,
    toast,
} from '@vendure/dashboard';

import {
    administratorNamesForCounterpartyDocument,
    reassignCounterpartyManagerByFilterDocument,
    reassignCounterpartyManagerDocument,
} from '../counterparty.graphql.js';
import type { CounterpartyListFilterInput } from '../counterparty-list-variables.js';

export interface AssignManagerDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    counterpartyIds: string[];
    // Set only when "every row matching the filter" is on offer (see shouldOfferAllMatching).
    allMatching?: { filter: CounterpartyListFilterInput; totalItems: number };
    onSuccess: () => void;
}

interface AdministratorOption {
    id: string;
    name: string;
}

export function AssignManagerDialog({
    open,
    onOpenChange,
    counterpartyIds,
    allMatching,
    onSuccess,
}: Readonly<AssignManagerDialogProps>) {
    const [administrators, setAdministrators] = useState<AdministratorOption[]>([]);
    const [loaded, setLoaded] = useState(false);
    const [selectedAdministratorId, setSelectedAdministratorId] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [applyToAllMatching, setApplyToAllMatching] = useState(false);
    const targetCount =
        applyToAllMatching && allMatching ? allMatching.totalItems : counterpartyIds.length;

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

    // The parent opens this via `open`, so Dialog's onOpenChange never fires for opening.
    useEffect(() => {
        if (!open) return;
        setApplyToAllMatching(false);
        if (!loaded) void loadAdministrators();
    }, [open]);

    async function handleAssign(): Promise<void> {
        if (!selectedAdministratorId) return;
        setSaving(true);
        setError('');
        try {
            if (applyToAllMatching && allMatching) {
                const result = await api.mutate(reassignCounterpartyManagerByFilterDocument, {
                    filter: allMatching.filter,
                    administratorId: selectedAdministratorId,
                    expectedCount: allMatching.totalItems,
                });
                toast.success(
                    `Manager assigned: ${result.reassignCounterpartyManagerByFilter} changed`,
                );
            } else {
                await Promise.all(
                    counterpartyIds.map(counterpartyId =>
                        api.mutate(reassignCounterpartyManagerDocument, {
                            counterpartyId,
                            administratorId: selectedAdministratorId,
                        }),
                    ),
                );
            }
            onOpenChange(false);
            onSuccess();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not assign manager');
        } finally {
            setSaving(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Assign manager</DialogTitle>
                    <DialogDescription>
                        Assign an administrator as manager for {targetCount}{' '}
                        {applyToAllMatching ? 'matching' : 'selected'} counterpart
                        {targetCount === 1 ? 'y' : 'ies'}.
                    </DialogDescription>
                </DialogHeader>
                {allMatching && (
                    <div className="flex items-center gap-2">
                        <Checkbox
                            id="assign-manager-all-matching"
                            checked={applyToAllMatching}
                            onCheckedChange={value => setApplyToAllMatching(!!value)}
                        />
                        <Label htmlFor="assign-manager-all-matching">
                            Apply to all {allMatching.totalItems} counterparties matching the
                            current filter
                        </Label>
                    </div>
                )}
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
                    <Button
                        onClick={() => void handleAssign()}
                        disabled={saving || !selectedAdministratorId}
                    >
                        Assign
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
