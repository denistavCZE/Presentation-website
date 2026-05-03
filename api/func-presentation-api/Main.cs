using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;
using Azure.Storage.Sas;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;

namespace presentation.api;

public class Main
{
    private readonly ILogger<Main> _logger;
    private readonly BlobServiceClient _blobServiceClient;
    
    private static readonly TimeSpan SasExpiry = TimeSpan.FromHours(1);
    
    private const string ContainerName = "models";

    public Main(ILogger<Main> logger, BlobServiceClient blobServiceClient)
    {
        _logger = logger;
        _blobServiceClient = blobServiceClient;
    }

    [Function("GetModels")]
    public async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Function, "get")] HttpRequest req)
    {
        _logger.LogInformation("GetModels function triggered.");

        try
        {
            var containerClient = _blobServiceClient.GetBlobContainerClient(ContainerName);
            
            var prefixes = new HashSet<string>();
            await foreach (var page in containerClient
                .GetBlobsByHierarchyAsync(BlobTraits.None, BlobStates.None, "/", null, CancellationToken.None)
                .AsPages())
            {
                foreach (var item in page.Values.Where(i => i.IsPrefix))
                {
                    prefixes.Add(item.Prefix.TrimEnd('/'));
                }
            }

            var models = new List<object>();

            foreach (var modelName in prefixes)
            {
                models.Add(new
                {
                    name = modelName,
                    thumbnail = GetSasUrl(containerClient, $"{modelName}/{modelName}.jpg"),
                    description = GetSasUrl(containerClient, $"{modelName}/{modelName}.md"),
                    model = GetSasUrl(containerClient, $"{modelName}/{modelName}.glb"),
                    tag = "weapon"
                });
            }

            return new OkObjectResult(models);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to retrieve models.");
            return new StatusCodeResult(500);
        }
    }

    private string GetSasUrl(BlobContainerClient containerClient, string blobPath)
    {
        var blobClient = containerClient.GetBlobClient(blobPath);
        
        var sasBuilder = new BlobSasBuilder
        {
            BlobContainerName = ContainerName,
            BlobName = blobPath,
            Resource = "b",
            ExpiresOn = DateTimeOffset.UtcNow.Add(SasExpiry)
        };
        sasBuilder.SetPermissions(BlobSasPermissions.Read);

        return blobClient.GenerateSasUri(sasBuilder).ToString();
    }
}