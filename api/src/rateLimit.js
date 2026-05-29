const TABLE_NAME = 'ratelimits';

const LIMITS = {
    'browse': { max: 100 },
    'download': { max: 20 },
};

async function checkRateLimit(ip, limitType = 'browse') {
    const client = getTableClient();
    const limit = LIMITS[limitType] ?? LIMITS['browse'];
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