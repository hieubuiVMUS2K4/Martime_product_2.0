# Build context: edge_product/ (includes the shared project).
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

COPY shared/Maritime.Shared.csproj shared/
COPY edge-services/EdgeCollector.csproj edge-services/
RUN dotnet restore edge-services/EdgeCollector.csproj

COPY shared/ shared/
COPY edge-services/ edge-services/
RUN dotnet publish edge-services/EdgeCollector.csproj -c Release -o /app/publish

FROM mcr.microsoft.com/dotnet/aspnet:8.0
WORKDIR /app
COPY --from=build /app/publish ./
COPY --from=build /src/edge-services/TestData/ ./TestData/
ENV ASPNETCORE_URLS=http://+:5001
EXPOSE 5001
ENTRYPOINT ["dotnet", "MaritimeEdgeServer.dll"]
