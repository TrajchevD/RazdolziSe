namespace TripSplit.Api.Services;

public interface IExchangeRateService
{
    /// <summary>
    /// Returns the rate to multiply an amount in <paramref name="fromCurrency"/> by to
    /// get an amount in <paramref name="toCurrency"/>. Returns 1 immediately (no network
    /// call) when the two currencies are the same.
    /// </summary>
    Task<decimal> GetRateAsync(string fromCurrency, string toCurrency);
}
