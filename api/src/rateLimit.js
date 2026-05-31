const { TableClient, AzureNamedKeyCredential } = require('@azure/data-tables');

const TABLE_NAME = 'ratelimits';

const LIMITS = {
    'browse': { max: 100 },
    'download': { max: 20 },
};

function getTableClient() {
    const accountName = process.env.STORAGE_ACCOUNT_NAME;
    const accountKey = process.env.STORAGE_ACCOUNT_KEY;
    const credential = new AzureNamedKeyCredential(accountName, accountKey);
    return new TableClient(
        `https://${accountName}.table.core.windows.net`,
        TABLE_NAME,
        credential
    );
}

function getCurrentWindow() {
    const now = new Date();
    return `${now.getUTCFullYear()}${String(now.getUTCMonth()+1).padStart(2,'0')}${String(now.getUTCDate()).padStart(2,'0')}${String(now.getUTCHours()).padStart(2,'0')}`;
}

async function checkRateLimit(rawip, limitType = 'browse') {
    const client = getTableClient();
    const limit = LIMITS[limitType] ?? LIMITS['browse'];
    const ip = rawIp.match(/^\d+\.\d+\.\d+\.\d+:\d+$/) 
    ? rawIp.split(':')[0] 
    : rawIp;
    const partitionKey = `${limitType}_${ip.replace(/[^a-zA-Z0-9]/g, '_')}`;
    const rowKey = getCurrentWindow();

    try {
        const entity = await client.getEntity(partitionKey, rowKey);
        
        if (entity.count >= limit.max) {
            return false;
        }

        await client.updateEntity({
            partitionKey,
            rowKey,
            count: entity.count + 1
        }, 'Merge');

        return true;

    } catch (err) {
        console.log(`RateLimit error: ${err.statusCode} - ${err.message}`);
        if (err.statusCode === 404) {
            await client.createEntity({
                partitionKey,
                rowKey,
                count: 1
            });
            return true;
        }
        return true;
    }
}

module.exports = { checkRateLimit };