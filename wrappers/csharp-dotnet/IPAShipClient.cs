using System;
using System.Net.Http;
using System.Threading.Tasks;

namespace IPAShip
{
    public class IPAShipClient
    {
        private readonly string _apiKey;
        public IPAShipClient(string apiKey) { _apiKey = apiKey; }

        public async Task AuditAsync(string filePath)
        {
            Console.WriteLine($"Auditing {filePath} via ipaship.com...");
            await Task.CompletedTask;
        }
    }
}