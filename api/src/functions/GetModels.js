const { app } = require('@azure/functions');
const { BlobServiceClient, generateBlobSASQueryParameters, BlobSASPermissions, StorageSharedKeyCredential } = require('@azure/storage-blob');

app.http('GetModels', {
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        const accountName = process.env.STORAGE_ACCOUNT_NAME;
        const accountKey = process.env.STORAGE_ACCOUNT_KEY;
        const containerName = 'models';

        const credential = new StorageSharedKeyCredential(accountName, accountKey);
        const client = new BlobServiceClient(`https://${accountName}.blob.core.windows.net`, credential);
        const containerClient = client.getContainerClient(containerName);

        const prefixes = new Set();
        for await (const item of containerClient.listBlobsByHierarchy('/')) {
            if (item.kind === 'prefix') {
                prefixes.add(item.name.replace('/', ''));
            }
        }

        const expiry = new Date();
        expiry.setHours(expiry.getHours() + 1);

        const models = [...prefixes].map(name => {
            const makeSas = (file) => {
                const sasParams = generateBlobSASQueryParameters({
                    containerName,
                    blobName: `${name}/${file}`,
                    permissions: BlobSASPermissions.parse('r'),
                    expiresOn: expiry,
                }, credential);
                return `https://${accountName}.blob.core.windows.net/${containerName}/${name}/${file}?${sasParams}`;
            };

            return {
                name,
                thumbnail: makeSas(`${name}.jpg`),
                description: makeSas(`${name}.md`),
                model: makeSas(`${name}.glb`)
            };
        });

        return {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(models)
        };
    }
});