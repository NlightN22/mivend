import { expect } from '@playwright/test';

const SERVER_URL = process.env.SERVER_URL ?? 'http://localhost:3000';

interface MailboxListItem {
    fileName: string;
    recipient: string;
    subject: string;
}

async function mailsFor(email: string, subject: string): Promise<string[]> {
    const list = (await (await fetch(`${SERVER_URL}/mailbox/list`)).json()) as MailboxListItem[];
    return list
        .filter(i => i.recipient === email && i.subject === subject)
        .map(i => i.fileName)
        .sort();
}

// The mailbox directory outlives runs: only a mail that appears after `trigger` counts.
export async function tokenFromNewMail(
    email: string,
    subject: string,
    linkPath: string,
    trigger: () => Promise<unknown>,
): Promise<string> {
    const before = new Set(await mailsFor(email, subject));
    await trigger();
    let fileName: string | undefined;
    await expect(async () => {
        fileName = (await mailsFor(email, subject)).filter(f => !before.has(f)).pop();
        expect(fileName, `no new "${subject}" mail for ${email} in /mailbox`).toBeTruthy();
    }).toPass({ timeout: 30_000 });
    const item = (await (
        await fetch(`${SERVER_URL}/mailbox/item/${encodeURIComponent(fileName!)}`)
    ).json()) as { body: string };
    const pattern = new RegExp(`href="([^"]*${linkPath}\\?token=[^"]*)"`);
    const href = pattern.exec(item.body)?.[1];
    expect(href, `${linkPath} link in the mail`).toBeTruthy();
    return new URL(href!.replace(/&amp;/g, '&')).searchParams.get('token')!;
}
