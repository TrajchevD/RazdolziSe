namespace TripSplit.Api.Services;

public interface IIpCurrencyService
{
    /// <summary>
    /// Best-effort guess at a currency based on where an IP address geolocates to.
    /// Never throws — falls back to a sensible default for local/private addresses or
    /// if the lookup fails, since this only ever pre-fills a form field the user can
    /// change anyway.
    /// </summary>
    Task<string> SuggestCurrencyAsync(string? ipAddress);
}
