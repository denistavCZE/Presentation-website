const { app } = require('@azure/functions');
const { generateBlobSASQueryParameters, BlobSASPermissions, StorageSharedKeyCredential } = require('@azure/storage-blob');

const VALID_CONTAINERS = ['scripts', '3d-models', 'maps', 'mods', 'programs'];

app.http('GetDownloadUrl', {
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        try {

            const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
            const allowed = await checkRateLimit(ip, 'download');
            if (!allowed) {
                return { status: 429, body: 'Too many requests. Try again later.' };
            }

            const type = request.query.get('type');
            const blobPath = request.query.get('path');

            if (!type || !VALID_CONTAINERS.includes(type)) {
                return { status: 400, body: 'Invalid type.' };
            }
            if (!blobPath) {
                return { status: 400, body: 'Missing path.' };
            }

            // Bezpečnostní kontrola - zabraň path traversal
            if (blobPath.includes('..') || blobPath.startsWith('/')) {
                return { status: 400, body: 'Invalid path.' };
            }
            
            const accountName = process.env.STORAGE_ACCOUNT_NAME;
            const accountKey = process.env.STORAGE_ACCOUNT_KEY;
            const credential = new StorageSharedKeyCredential(accountName, accountKey);

            const expiry = new Date();
            expiry.setMinutes(expiry.getMinutes() + 1); // 1 minuta

            const sasParams = generateBlobSASQueryParameters({
                containerName: type,
                blobName: blobPath,
                permissions: BlobSASPermissions.parse('r'),
                expiresOn: expiry,
            }, credential);

            const url = `https://${accountName}.blob.core.windows.net/${type}/${blobPath}?${sasParams}`;

            return {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url })
            };
        } catch (err) {
            context.log.error('Error:', err.message);
            return { status: 500, body: `Error: ${err.message}` };
        }
    }
});