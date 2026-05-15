const { app } = require('@azure/functions');
const { BlobServiceClient, generateBlobSASQueryParameters, BlobSASPermissions, StorageSharedKeyCredential } = require('@azure/storage-blob');

app.http('GetModels', {
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        try {
            const accountName = process.env.STORAGE_ACCOUNT_NAME;
            const accountKey = process.env.STORAGE_ACCOUNT_KEY;
            const containerName = 'models';

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

            const models = [];

            // Projdi kategorie (weapon, prop, character...)
            for await (const category of containerClient.listBlobsByHierarchy('/')) {
                if (category.kind !== 'prefix') continue;
                const categoryName = category.name.replace('/', '');

                // Projdi modely
                for await (const modelFolder of containerClient.listBlobsByHierarchy('/', { prefix: category.name })) {
                    if (modelFolder.kind !== 'prefix') continue;
                    const modelPath = modelFolder.name;
                    const modelName = modelPath.replace(category.name, '').replace('/', '');

                    const MODEL_EXTENSIONS = ['glb', 'gltf', 'obj', 'fbx', 'stl'];

                    let modelFile = null;
                    let thumbnailFile = null;
                    let descriptionFile = null;

                    for await (const blob of containerClient.listBlobsFlat({ prefix: modelPath })) {
                        const fileName = blob.name.split('/').pop();
                        const ext = fileName.split('.').pop().toLowerCase();

                        if (ext === 'md') {
                            descriptionFile = blob.name;
                        } else if (ext === 'jpg' || ext === 'jpeg' || ext === 'png') {
                            thumbnailFile = blob.name;
                        } else if (MODEL_EXTENSIONS.includes(ext)) {
                            modelFile = blob.name;
                        }
                    }

                    models.push({
                        name: modelName,
                        category: categoryName,
                        extension: modelFile ? modelFile.split('.').pop() : null,
                        thumbnail: thumbnailFile ? makeSas(thumbnailFile) : null,
                        description: descriptionFile ? makeSas(descriptionFile) : null,
                        model: modelFile ? makeSas(modelFile) : null,
                    });
                }
            }

            return {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(models)
            };
        } catch (err) {
            context.log.error('Error:', err.message);
            return { status: 500, body: `Error: ${err.message}` };
        }
    }
});