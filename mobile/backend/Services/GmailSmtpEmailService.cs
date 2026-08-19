using System.Net;
using System.Net.Mail;

namespace TripSplit.Api.Services;

/// <summary>
/// Sends mail through Gmail's SMTP relay using an account App Password — not the
/// account's real password. Generate one at myaccount.google.com -> Security ->
/// 2-Step Verification -> App passwords (requires 2FA already enabled on that
/// Google account), then paste it into Email:GmailAppPassword in config yourself
/// (see appsettings.json's Email._comment) — this project never touches real
/// credentials on your behalf.
///
/// Uses the framework's built-in SmtpClient rather than adding a new NuGet
/// dependency (e.g. MailKit, which Microsoft's own docs now recommend instead):
/// for one fire-and-forget plaintext send at this project's scale, pulling in a
/// whole extra library felt like more than the ~20 lines here need. Revisit with
/// MailKit if this ever needs HTML templates, attachments, or retry/pooling.
/// </summary>
public class GmailSmtpEmailService : IEmailService
{
    private readonly IConfiguration _config;
    private readonly ILogger<GmailSmtpEmailService> _logger;

    public GmailSmtpEmailService(IConfiguration config, ILogger<GmailSmtpEmailService> logger)
    {
        _config = config;
        _logger = logger;
    }

    public async Task SendAsync(string toEmail, string subject, string body)
    {
        var gmailAddress = _config["Email:GmailAddress"];
        var gmailAppPassword = _config["Email:GmailAppPassword"];
        var fromDisplayName = _config["Email:FromDisplayName"] ?? "RazdolziSe";

        if (string.IsNullOrWhiteSpace(gmailAddress)
            || string.IsNullOrWhiteSpace(gmailAppPassword)
            || gmailAddress.StartsWith("YOUR_", StringComparison.OrdinalIgnoreCase)
            || gmailAppPassword.StartsWith("YOUR_", StringComparison.OrdinalIgnoreCase))
        {
            // Deliberately doesn't throw — a missing/placeholder email config shouldn't
            // 500 every verify/reset call. Logged loudly (with the actual body, which
            // contains the code) instead, so local testing works before real Gmail
            // credentials are wired up, and so it's obvious in Render's logs why real
            // users would be reporting "I never got the code."
            _logger.LogWarning(
                "Email:GmailAddress / Email:GmailAppPassword are not configured — would have sent to {ToEmail}: [{Subject}] {Body}",
                toEmail,
                subject,
                body);
            return;
        }

        using var client = new SmtpClient("smtp.gmail.com", 587)
        {
            EnableSsl = true,
            Credentials = new NetworkCredential(gmailAddress, gmailAppPassword),
        };

        using var message = new MailMessage
        {
            From = new MailAddress(gmailAddress, fromDisplayName),
            Subject = subject,
            Body = body,
            IsBodyHtml = false,
        };
        message.To.Add(toEmail);

        await client.SendMailAsync(message);
    }
}
