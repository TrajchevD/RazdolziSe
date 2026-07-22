# Render has no native .NET runtime, so the API ships as a container.
# Multi-stage build: compile with the full SDK image, run on the much smaller
# ASP.NET runtime-only image.

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Copy the project file first and restore separately so Docker can cache the
# (slow) NuGet restore layer as long as TripSplit.Api.csproj hasn't changed.
COPY TripSplit.Api.csproj ./
RUN dotnet restore TripSplit.Api.csproj

COPY . .
RUN dotnet publish TripSplit.Api.csproj -c Release -o /app/publish --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
COPY --from=build /app/publish .

# Render auto-detects the port from EXPOSE. ASPNETCORE_HTTP_PORTS (built into
# the ASP.NET Core image) tells Kestrel to listen on it without needing a
# launchSettings.json or an explicit ASPNETCORE_URLS override.
ENV ASPNETCORE_HTTP_PORTS=8080
EXPOSE 8080

ENTRYPOINT ["dotnet", "TripSplit.Api.dll"]
