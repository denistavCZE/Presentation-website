const { app } = require('@azure/functions');
const { BlobServiceClient, generateBlobSASQueryParameters, BlobSASPermissions, StorageSharedKeyCredential } = require('@azure/storage-blob');

app.http('GetScripts', {
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        const accountName = process.env.STORAGE_ACCOUNT_NAME;
        const accountKey = process.env.STORAGE_ACCOUNT_KEY;
        const containerName = 'scripts';

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

        // Projdi všechny složky (skripty)
        const scripts = [];
        for await (const folder of containerClient.listBlobsByHierarchy('/')) {
            if (folder.kind !== 'prefix') continue;
            const folderName = folder.name.replace('/', '');

            let scriptFile = null;
            let descriptionFile = null;

            // Projdi soubory uvnitř složky
            for await (const blob of containerClient.listBlobsFlat({ prefix: folder.name })) {
                const fileName = blob.name.split('/').pop();
                const ext = fileName.split('.').pop().toLowerCase();

                if (ext === 'md') {
                    descriptionFile = blob.name;
                } else {
                    // Cokoliv co není md je samotný skript
                    scriptFile = blob.name;
                }
            }

            scripts.push({
                name: folderName,
                extension: scriptFile ? scriptFile.split('.').pop() : null,
                description: descriptionFile ? makeSas(descriptionFile) : null,
                script: scriptFile ? makeSas(scriptFile) : null,
            });
        }

        return {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(scripts)
        };
    }
});