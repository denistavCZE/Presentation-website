const { app } = require('@azure/functions');
const { BlobServiceClient, generateBlobSASQueryParameters, BlobSASPermissions, StorageSharedKeyCredential } = require('@azure/storage-blob');

const VALID_CONTAINERS = ['scripts', '3d-models', 'maps', 'mods', 'games'];
const THUMBNAIL_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];

app.http('GetItems', {
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        try {
            const type = request.query.get('type');

            if (!type || !VALID_CONTAINERS.includes(type)) {
                return { status: 400, body: `Invalid type. Must be one of: ${VALID_CONTAINERS.join(', ')}` };
            }

            const accountName = process.env.STORAGE_ACCOUNT_NAME;
            const accountKey = process.env.STORAGE_ACCOUNT_KEY;

            const credential = new StorageSharedKeyCredential(accountName, accountKey);
            const client = new BlobServiceClient(`https://${accountName}.blob.core.windows.net`, credential);
            const containerClient = client.getContainerClient(type);

            const expiry = new Date();
            expiry.setHours(expiry.getHours() + 1);

            const makeSas = (blobName) => {
                const sasParams = generateBlobSASQueryParameters({
                    containerName: type,
                    blobName,
                    permissions: BlobSASPermissions.parse('r'),
                    expiresOn: expiry,
                }, credential);
                return `https://${accountName}.blob.core.windows.net/${type}/${blobName}?${sasParams}`;
            };

            const items = [];

            for await (const category of containerClient.listBlobsByHierarchy('/')) {
                if (category.kind !== 'prefix') continue;
                const categoryName = category.name.replace('/', '');

                for await (const itemFolder of containerClient.listBlobsByHierarchy('/', { prefix: category.name })) {
                    if (itemFolder.kind !== 'prefix') continue;
                    const itemPath = itemFolder.name;
                    const itemName = itemPath.replace(category.name, '').replace('/', '').replace(/__[^/]+$/, '');

                    let mainZip = null;
                    let mainExtension = null;
                    let sourceZip = null;
                    let sourceExtension = null;
                    let thumbnail = null;

                    for await (const blob of containerClient.listBlobsFlat({ prefix: itemPath })) {
                        const fileName = blob.name.split('/').pop();
                        const ext = fileName.split('.').pop().toLowerCase();

                        if (THUMBNAIL_EXTENSIONS.includes(ext)) {
                            thumbnail = blob.name;
                        } else if (ext === 'zip') {
                            // vytáhne extension schovanou za "__"
                            const hiddenExtensionMatch = fileName.match(/__(.+)\.zip$/i);
                            const hiddenExtension = hiddenExtensionMatch
                                ? hiddenExtensionMatch[1]
                                : null;

                            if (fileName.includes('_source')) {
                                sourceZip = blob.name;
                                sourceExtension = hiddenExtension;
                            } else {
                                mainZip = blob.name;
                                mainExtension = hiddenExtension;
                            }
                        }
                    }

                    items.push({
                        name: itemName,
                        category: categoryName,
                        thumbnail: thumbnail ? makeSas(thumbnail) : null,
                        download: mainZip ? makeSas(mainZip) : null,
                        downloadExtension: mainExtension,
                        source: sourceZip ? makeSas(sourceZip) : null,
                        sourceExtension: sourceExtension,
                    });
                }
            }

            return {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(items)
            };
        } catch (err) {
            context.log.error('Error:', err.message);
            return { status: 500, body: `Error: ${err.message}` };
        }
    }
});