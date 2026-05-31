const { app } = require('@azure/functions');
const { TableClient, AzureNamedKeyCredential } = require('@azure/data-tables');

app.timer('CleanRateLimits', {
    schedule: '0 0 3 * * *', 
    handler: async (myTimer, context) => {
        const accountName = process.env.STORAGE_ACCOUNT_NAME;
        const accountKey = process.env.STORAGE_ACCOUNT_KEY;
        const credential = new AzureNamedKeyCredential(accountName, accountKey);
        const client = new TableClient(
            `https://${accountName}.table.core.windows.net`,
            'ratelimits',
            credential
        );

        const currentWindow = getCurrentWindow();
        let deleted = 0;

        for await (const entity of client.listEntities()) {
            if (entity.rowKey < currentWindow) {
                await client.deleteEntity(entity.partitionKey, entity.rowKey);
                deleted++;
            }
        }

        console.error('Error:', `Cleaned ${deleted} old rate limit entries`);
    }
});

function getCurrentWindow() {
    const now = new Date();
    return `${now.getUTCFullYear()}${String(now.getUTCMonth()+1).padStart(2,'0')}${String(now.getUTCDate()).padStart(2,'0')}${String(now.getUTCHours()).padStart(2,'0')}`;
}