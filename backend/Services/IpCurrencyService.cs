using System.Net;
using System.Net.Http.Json;
using System.Net.Sockets;
using System.Text.Json.Serialization;

namespace TripSplit.Api.Services;

public class IpCurrencyService : IIpCurrencyService
{
    private const string FallbackCurrency = "EUR";

    private readonly HttpClient _http;

    public IpCurrencyService(HttpClient http)
    {
        _http = http;
    }

    public async Task<string> SuggestCurrencyAsync(string? ipAddress)
    {
        if (string.IsNullOrWhiteSpace(ipAddress) || IsPrivateOrLoopback(ipAddress))
        {
            return FallbackCurrency;
        }

        try
        {
            // ip-api.com's free tier is HTTP-only (HTTPS needs a paid plan) — that's
            // fine here since this call happens server-to-server from the backend, not
            // from the browser, so there's no mixed-content restriction to work around.
            var response = await _http.GetAsync($"http://ip-api.com/json/{ipAddress}?fields=status,currency");
            if (!response.IsSuccessStatusCode)
            {
                return FallbackCurrency;
            }

            var payload = await response.Content.ReadFromJsonAsync<IpApiResponse>();
            if (payload is { Status: "success" } && !string.IsNullOrWhiteSpace(payload.Currency))
            {
                return payload.Currency;
            }
        }
        catch (HttpRequestException)
        {
            // Fall through to the default below.
        }
        catch (TaskCanceledException)
        {
            // Fall through to the default below.
        }

        return FallbackCurrency;
    }

    /// <summary>
    /// Local dev (loopback) and requests that only ever reach us via a private network
    /// hop can't be geolocated to anything meaningful — skip the external call entirely
    /// rather than send a useless lookup for 127.0.0.1 or a 10.x/172.16-31.x/192.168.x
    /// address.
    /// </summary>
    private static bool IsPrivateOrLoopback(string ip)
    {
        if (!IPAddress.TryParse(ip, out var address))
        {
            return true;
        }

        if (IPAddress.IsLoopback(address))
        {
            return true;
        }

        if (address.AddressFamily != AddressFamily.InterNetwork)
        {
            return false;
        }

        var bytes = address.GetAddressBytes();
        return bytes[0] == 10
            || (bytes[0] == 172 && bytes[1] is >= 16 and <= 31)
            || (bytes[0] == 192 && bytes[1] == 168);
    }

    private class IpApiResponse
    {
        [JsonPropertyName("status")]
        public string? Status { get; set; }

        [JsonPropertyName("currency")]
        public string? Currency { get; set; }
    }
}
