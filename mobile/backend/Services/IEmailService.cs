namespace TripSplit.Api.Services;

/// <summary>
/// Sends transactional emails (verification codes, password reset codes) — one
/// abstraction, one concrete implementation for now (GmailSmtpEmailService).
/// Kept generic (plain subject/body) rather than one method per email type so
/// AuthService owns the copy for each message; this interface only owns "how do
/// we actually get a message out the door."
/// </summary>
public interface IEmailService
{
    Task SendAsync(string toEmail, string subject, string body);
}
