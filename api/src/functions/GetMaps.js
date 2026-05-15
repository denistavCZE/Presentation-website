const { app } = require('@azure/functions');
const { BlobServiceClient, generateBlobSASQueryParameters, BlobSASPermissions, StorageSharedKeyCredential } = require('@azure/storage-blob');

app.http('GetMaps', {
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        try {
            const accountName = process.env.STORAGE_ACCOUNT_NAME;
            const accountKey = process.env.STORAGE_ACCOUNT_KEY;
            const containerName = 'maps';

            const credential = new StorageSharedKeyCredential(accountName, accountKey);
            const client = new BlobServiceClient(`https://${accountName}.blob.core.windows.net`, credential);
            const containerClient = client.getContainerClient(containerName);

            const expiry = new Date();
            expiry.setHours(expiry.getHours() + 1);

            const makeSas = (blobName) => {
                const sasParams = generateBlobSASQueryParameters({
                    containerName,
                    blobName,
                    permissions: BlobSASPermissions.parse('r'),
                    expiresOn: expiry,
                }, credential);
                return `https://${accountName}.blob.core.windows.net/${containerName}/${blobName}?${sasParams}`;
            };

            const THUMBNAIL_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];

            const maps = [];

            // Projdi hry (arma3, dayz...)
            for await (const game of containerClient.listBlobsByHierarchy('/')) {
                if (game.kind !== 'prefix') continue;
                const gameName = game.name.replace('/', '');

                // Projdi mapy uvnitř hry
                for await (const mapFolder of containerClient.listBlobsByHierarchy('/', { prefix: game.name })) {
                    if (mapFolder.kind !== 'prefix') continue;
                    const mapPath = mapFolder.name;
                    const mapName = mapPath.replace(game.name, '').replace('/', '');

                    let zipFile = null;
                    let thumbnailFile = null;

                    for await (const blob of containerClient.listBlobsFlat({ prefix: mapPath })) {
                        const ext = blob.name.split('.').pop().toLowerCase();
                        if (ext === 'zip') {
                            zipFile = blob.name;
                        } else if (THUMBNAIL_EXTENSIONS.includes(ext)) {
                            thumbnailFile = blob.name;
                        }
                    }

                    maps.push({
                        name: mapName,
                        game: gameName,
                        thumbnail: thumbnailFile ? makeSas(thumbnailFile) : null,
                        download: zipFile ? makeSas(zipFile) : null,
                    });
                }
            }

            return {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(maps)
            };
        } catch (err) {
            context.log.error('Error:', err.message);
            return { status: 500, body: `Error: ${err.message}` };
        }
    }
});