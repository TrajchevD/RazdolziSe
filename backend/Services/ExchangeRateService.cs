using System.Net.Http.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Caching.Memory;

namespace TripSplit.Api.Services;

public class ExchangeRateService : IExchangeRateService
{
    // open.er-api.com (ExchangeRate-API's free, keyless "open" endpoint) rather than
    // the more commonly recommended Frankfurter — Frankfurter only tracks ~30 major
    // currencies via the ECB and does not include MKD (Macedonian Denar), which this
    // app needs to support. open.er-api.com covers all ~160 ISO 4217 currencies and
    // needs no API key. Rates update once a day, so caching for a few hours is safe.
    private const string BaseUrl = "https://open.er-api.com/v6/latest/";
    private static readonly TimeSpan CacheDuration = TimeSpan.FromHours(6);

    private readonly HttpClient _http;
    private readonly IMemoryCache _cache;

    public ExchangeRateService(HttpClient http, IMemoryCache cache)
    {
        _http = http;
        _cache = cache;
    }

    public async Task<decimal> GetRateAsync(string fromCurrency, string toCurrency)
    {
        var from = fromCurrency.Trim().ToUpperInvariant();
        var to = toCurrency.Trim().ToUpperInvariant();

        if (from == to)
        {
            return 1m;
        }

        var rates = await _cache.GetOrCreateAsync($"fx:{from}", async entry =>
        {
            entry.AbsoluteExpirationRelativeToNow = CacheDuration;
            return await FetchRatesAsync(from);
        });

        if (rates is null || !rates.TryGetValue(to, out var rate))
        {
            throw new InvalidOperationException(
                $"Couldn't get an exchange rate from {from} to {to} right now — try again in a moment.");
        }

        return rate;
    }

    private async Task<Dictionary<string, decimal>?> FetchRatesAsync(string baseCurrency)
    {
        HttpResponseMessage response;
        try
        {
            response = await _http.GetAsync($"{BaseUrl}{baseCurrency}");
        }
        catch (HttpRequestException)
        {
            return null;
        }
        catch (TaskCanceledException)
        {
            return null;
        }

        if (!response.IsSuccessStatusCode)
        {
            return null;
        }

        var payload = await response.Content.ReadFromJsonAsync<ExchangeRateApiResponse>();
        if (payload is null || payload.Result != "success" || payload.Rates is null)
        {
            return null;
        }

        return payload.Rates;
    }

    private class ExchangeRateApiResponse
    {
        [JsonPropertyName("result")]
        public string? Result { get; set; }

        [JsonPropertyName("rates")]
        public Dictionary<string, decimal>? Rates { get; set; }
    }
}
