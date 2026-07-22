using System.Net;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;

namespace TripSplit.Api.Middleware;

/// <summary>
/// Catches exceptions thrown anywhere in the request pipeline and maps them to a
/// consistent JSON error shape and HTTP status code, so controllers/services don't
/// need a try/catch in every method — they just throw the exception that matches
/// what went wrong, and it lands on the right status code here.
/// </summary>
public class ExceptionHandlingMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<ExceptionHandlingMiddleware> _logger;

    public ExceptionHandlingMiddleware(RequestDelegate next, ILogger<ExceptionHandlingMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await _next(context);
        }
        catch (Exception ex)
        {
            var (status, message) = ex switch
            {
                KeyNotFoundException => (HttpStatusCode.NotFound, ex.Message),
                UnauthorizedAccessException => (HttpStatusCode.Forbidden, ex.Message),
                InvalidOperationException => (HttpStatusCode.BadRequest, ex.Message),
                ArgumentException => (HttpStatusCode.BadRequest, ex.Message),
                FormatException => (HttpStatusCode.BadRequest, "One or more values were in an unexpected format."),
                // Thrown by SaveChangesAsync when an UPDATE/DELETE affects 0 rows instead of
                // the expected 1 — i.e. the row was already changed or deleted by another
                // request since this one loaded it (a double-submitted Save, or a genuine
                // second edit/delete from elsewhere). Must be checked BEFORE the general
                // DbUpdateException case below, since this type derives from it and switch
                // arms are matched in order — the first arm whose type matches wins.
                DbUpdateConcurrencyException => (HttpStatusCode.Conflict, "This was already changed or removed elsewhere — please refresh and try again."),
                // Thrown by SaveChangesAsync when a unique index is violated (e.g. two
                // concurrent requests both add the same email/trip-member combination) —
                // the second request loses the race and should see a clean 409, not a 500.
                DbUpdateException => (HttpStatusCode.Conflict, "That action conflicts with something that already exists — please try again."),
                _ => (HttpStatusCode.InternalServerError, "An unexpected error occurred."),
            };

            if (status == HttpStatusCode.InternalServerError)
            {
                _logger.LogError(ex, "Unhandled exception while processing {Path}", context.Request.Path);
            }

            context.Response.ContentType = "application/json";
            context.Response.StatusCode = (int)status;
            await context.Response.WriteAsync(JsonSerializer.Serialize(new { message }));
        }
    }
}
