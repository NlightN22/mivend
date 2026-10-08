import { Page, PageTitle, Tabs, TabsContent, TabsList, TabsTrigger } from '@vendure/dashboard';

import { InboundTab } from './inbound-tab.js';
import { OutboundTab } from './outbound-tab.js';

export function IntegrationHealthPage() {
    return (
        <Page pageId="integration-health">
            <PageTitle>Integration health</PageTitle>
            <Tabs defaultValue="inbound" orientation="horizontal" className="flex-col">
                <TabsList className="w-fit">
                    <TabsTrigger value="inbound">Inbound</TabsTrigger>
                    <TabsTrigger value="outbound">Outbound</TabsTrigger>
                </TabsList>
                <TabsContent value="inbound">
                    <InboundTab />
                </TabsContent>
                <TabsContent value="outbound">
                    <OutboundTab />
                </TabsContent>
            </Tabs>
        </Page>
    );
}
