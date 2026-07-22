using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using TripSplit.Api.Data;
using TripSplit.Api.Middleware;
using TripSplit.Api.Models;
using TripSplit.Api.Services;

var builder = WebApplication.CreateBuilder(args);

// ---- Controllers + Swagger (with a JWT "Authorize" button for manual testing) ----
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new OpenApiInfo { Title = "TripSplit API", Version = "v1" });

    options.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Name = "Authorization",
        Type = SecuritySchemeType.ApiKey,
        Scheme = "Bearer",
        BearerFormat = "JWT",
        In = ParameterLocation.Header,
        Description = "Paste: Bearer {token} (get a token from POST /api/auth/login)",
    });

    options.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        {
            new OpenApiSecurityScheme
            {
                Reference = new OpenApiReference { Type = ReferenceType.SecurityScheme, Id = "Bearer" },
            },
            Array.Empty<string>()
        },
    });
});

// ---- Database (MySQL-wire-protocol — TiDB Cloud, or any MySQL/MariaDB server
// reachable from ConnectionStrings:DefaultConnection in appsettings.json) ----
//
// Using a fixed ServerVersion instead of ServerVersion.AutoDetect(...): AutoDetect
// opens a connection and parses the server's version string before the app has
// even started up, which adds a startup round-trip and has no retry policy if
// that first connection hiccups. TiDB implements the MySQL 5.7 wire protocol, so
// 5.7.25 is a safe, widely-used fixed version for Pomelo + TiDB.
var dbConnectionString = builder.Configuration.GetConnectionString("DefaultConnection");
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseMySql(dbConnectionString, new MySqlServerVersion(new Version(5, 7, 25))));

// ---- Application services (the 3-layer split: Controllers -> Services -> Data) ----
builder.Services.AddScoped<IAuthService, AuthService>();
builder.Services.AddScoped<ITripService, TripService>();
builder.Services.AddScoped<IExpenseService, ExpenseService>();
builder.Services.AddScoped<ISettlementService, SettlementService>();
builder.Services.AddSingleton<IPasswordHasher<User>, PasswordHasher<User>>();

// ---- JWT authentication ----
var jwtKey = builder.Configuration["Jwt:Key"]!;
var jwtIssuer = builder.Configuration["Jwt:Issuer"]!;
var jwtAudience = builder.Configuration["Jwt:Audience"]!;

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        // Without this, the JWT bearer handler silently renames the "sub" claim to a
        // long legacy URI (ClaimTypes.NameIdentifier) on the way in, which breaks
        // ControllerExtensions.GetUserId()'s lookup of JwtRegisteredClaimNames.Sub.
        options.MapInboundClaims = false;
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = jwtIssuer,
            ValidAudience = jwtAudience,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey)),
        };
    });

builder.Services.AddAuthorization();

// ---- CORS so the Angular dev server (localhost:4200) can call this API ----
var allowedOrigin = builder.Configuration["Cors:AllowedOrigin"] ?? "http://localhost:4200";
builder.Services.AddCors(options =>
{
    options.AddPolicy("Frontend", policy =>
    {
        policy.WithOrigins(allowedOrigin)
              .AllowAnyHeader()
              .AllowAnyMethod();
    });
});

var app = builder.Build();

// Auto-create the database (and every table) on startup if it doesn't
// exist yet. This project intentionally skips EF Core migrations for simplicity —
// fine for an internship-scope build where nobody else's production data depends
// on the schema yet. Note: EnsureCreated() does NOT update an existing database's
// schema if you later change a model — for that you'd need to drop the database
// (or a specific table) and let it recreate, or switch to real migrations:
// `dotnet ef migrations add InitialCreate`.
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.EnsureCreated();
}

app.UseMiddleware<ExceptionHandlingMiddleware>();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
    // Only redirect http->https locally. Behind Render's proxy, TLS is already
    // terminated at the edge and the container only ever sees plain HTTP — forcing
    // a redirect here would just bounce every request in a loop.
    app.UseHttpsRedirection();
}

app.UseCors("Frontend");
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

app.Run();
