import type { ReactNode } from 'react';

export function DataSection({
    title,
    hint,
    aside,
    children,
}: Readonly<{ title: string; hint?: string; aside?: ReactNode; children: ReactNode }>) {
    return (
        <div className="space-y-2">
            <div className="flex items-center gap-2">
                <span className="font-medium">{title}</span>
                {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
                <span className="ml-auto flex items-center gap-2">{aside}</span>
            </div>
            <div className="rounded-md border bg-background">{children}</div>
        </div>
    );
}
