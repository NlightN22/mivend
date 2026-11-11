import { useEffect, useState } from 'react';
import {
    api,
    Button,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    Input,
    Label,
    toast,
} from '@vendure/dashboard';

import { updateNotificationRetentionDocument } from './notification-retention.graphql.js';
import { DEFAULT_RULE_KEY, describeType, parseDaysInput } from './retention-form.js';

export interface EditableRetentionRule {
    id: string;
    sourceType: string;
    readDays: number | null;
    unreadDays: number | null;
}

export interface RetentionDialogProps {
    editing: EditableRetentionRule | null;
    onOpenChange: (open: boolean) => void;
    onSaved: () => void;
}

export function RetentionDialog({ editing, onOpenChange, onSaved }: RetentionDialogProps) {
    const [readText, setReadText] = useState('');
    const [unreadText, setUnreadText] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const isDefault = editing?.sourceType === DEFAULT_RULE_KEY;

    useEffect(() => {
        if (!editing) return;
        setReadText(editing.readDays === null ? '' : String(editing.readDays));
        setUnreadText(editing.unreadDays === null ? '' : String(editing.unreadDays));
        setError(null);
    }, [editing]);

    async function handleSave(): Promise<void> {
        if (!editing) return;
        const read = parseDaysInput(readText, !isDefault);
        const unread = parseDaysInput(unreadText, !isDefault);
        if (!read.ok || !unread.ok) {
            setError(!read.ok ? read.problem : !unread.ok ? unread.problem : null);
            return;
        }
        setSaving(true);
        setError(null);
        try {
            await api.mutate(updateNotificationRetentionDocument, {
                id: editing.id,
                input: { readDays: read.value, unreadDays: unread.value },
            });
            toast.success('Retention saved');
            onSaved();
            onOpenChange(false);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not save the retention');
        } finally {
            setSaving(false);
        }
    }

    return (
        <Dialog open={editing !== null} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{editing ? describeType(editing.sourceType) : ''}</DialogTitle>
                    <DialogDescription>
                        How long notifications of this type are kept before the hourly cleanup
                        deletes them. Leave a field empty to use the default.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-2">
                    <Label htmlFor="retention-read">Read or resolved, days</Label>
                    <Input
                        id="retention-read"
                        inputMode="numeric"
                        value={readText}
                        onChange={e => setReadText(e.target.value)}
                    />
                    <Label htmlFor="retention-unread">Unread, days</Label>
                    <Input
                        id="retention-unread"
                        inputMode="numeric"
                        value={unreadText}
                        onChange={e => setUnreadText(e.target.value)}
                    />
                </div>
                {error && <p className="text-destructive text-sm">{error}</p>}
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                        Cancel
                    </Button>
                    <Button onClick={() => void handleSave()} disabled={saving}>
                        Save
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
