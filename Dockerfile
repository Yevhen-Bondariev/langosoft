FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY backend/LangoSoft.Api/LangoSoft.Api.csproj .
RUN dotnet restore
COPY backend/LangoSoft.Api/ .
RUN dotnet publish -c Release -o /publish

FROM mcr.microsoft.com/dotnet/aspnet:8.0
WORKDIR /app
COPY --from=build /publish ./
EXPOSE 10000
ENV PORT=10000
ENTRYPOINT ["dotnet", "LangoSoft.Api.dll"]
