using LangoSoft.Api.Data;
using LangoSoft.Api.Services;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers()
    .AddJsonOptions(o =>
        o.JsonSerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase);

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var dbUrl = Environment.GetEnvironmentVariable("DATABASE_URL");
if (!string.IsNullOrEmpty(dbUrl))
{
    // Convert Neon/Heroku-style PostgreSQL URI to Npgsql connection string
    var uri = new Uri(dbUrl);
    var userInfo = uri.UserInfo.Split(':', 2);
    var npgsqlConn = $"Host={uri.Host};Port={Math.Max(uri.Port, 5432)};" +
                     $"Database={uri.AbsolutePath.TrimStart('/')};" +
                     $"Username={userInfo[0]};Password={userInfo[1]};" +
                     "SSL Mode=Require;Trust Server Certificate=true";
    builder.Services.AddDbContext<AppDbContext>(o => o.UseNpgsql(npgsqlConn));
}
else
    builder.Services.AddDbContext<AppDbContext>(o => o.UseSqlite("Data Source=langosoft.db"));

builder.Services.AddHttpClient();
builder.Services.AddScoped<BookImportService>();
builder.Services.AddScoped<SpacedRepetitionService>();
builder.Services.AddSingleton<GroqClient>();
builder.Services.AddScoped<EssayService>();
builder.Services.AddScoped<WordService>();
builder.Services.AddScoped<GrammarService>();

builder.Services.AddCors(options =>
    options.AddDefaultPolicy(policy =>
        policy.WithOrigins(
                "http://localhost:5173",
                "http://localhost:5174",
                "https://yevhen-bondariev.github.io")
              .AllowAnyHeader()
              .AllowAnyMethod()));

var app = builder.Build();

// DB init: EnsureCreated handles new DBs; raw SQL patches existing DBs that predate EF migrations.
using (var scope = app.Services.CreateScope())
{
    var ctx = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    await ctx.Database.EnsureCreatedAsync();

    var isPostgres = ctx.Database.ProviderName?.Contains("Npgsql") == true;
    var createArchaismCache = isPostgres
        ? """
          CREATE TABLE IF NOT EXISTS "ParagraphArchaismCaches" (
              "Id" serial PRIMARY KEY,
              "ParagraphId" integer NOT NULL UNIQUE REFERENCES "Paragraphs"("Id") ON DELETE CASCADE,
              "ArchaismsJson" text NOT NULL
          )
          """
        : """
          CREATE TABLE IF NOT EXISTS "ParagraphArchaismCaches" (
              "Id" INTEGER PRIMARY KEY AUTOINCREMENT,
              "ParagraphId" INTEGER NOT NULL UNIQUE REFERENCES "Paragraphs"("Id") ON DELETE CASCADE,
              "ArchaismsJson" TEXT NOT NULL
          )
          """;
    await ctx.Database.ExecuteSqlRawAsync(createArchaismCache);

    var createGlossCache = isPostgres
        ? """
          CREATE TABLE IF NOT EXISTS "ParagraphGlossCaches" (
              "Id" serial PRIMARY KEY,
              "ParagraphId" integer NOT NULL REFERENCES "Paragraphs"("Id") ON DELETE CASCADE,
              "TargetLanguage" text NOT NULL,
              "GlossJson" text NOT NULL,
              UNIQUE("ParagraphId", "TargetLanguage")
          )
          """
        : """
          CREATE TABLE IF NOT EXISTS "ParagraphGlossCaches" (
              "Id" INTEGER PRIMARY KEY AUTOINCREMENT,
              "ParagraphId" INTEGER NOT NULL REFERENCES "Paragraphs"("Id") ON DELETE CASCADE,
              "TargetLanguage" TEXT NOT NULL,
              "GlossJson" TEXT NOT NULL,
              UNIQUE("ParagraphId", "TargetLanguage")
          )
          """;
    await ctx.Database.ExecuteSqlRawAsync(createGlossCache);

    // FlashcardCategories table (default categories: beautiful, weird, difficult)
    var createCategories = isPostgres
        ? """
          CREATE TABLE IF NOT EXISTS "FlashcardCategories" (
              "Id" serial PRIMARY KEY,
              "Name" text NOT NULL,
              "IsDefault" boolean NOT NULL DEFAULT false,
              "Color" text NOT NULL DEFAULT '#6366f1'
          )
          """
        : """
          CREATE TABLE IF NOT EXISTS "FlashcardCategories" (
              "Id" INTEGER PRIMARY KEY AUTOINCREMENT,
              "Name" TEXT NOT NULL,
              "IsDefault" INTEGER NOT NULL DEFAULT 0,
              "Color" TEXT NOT NULL DEFAULT '#6366f1'
          )
          """;
    await ctx.Database.ExecuteSqlRawAsync(createCategories);

    // CategoryId column on Flashcards (nullable FK — silently ignored if already present)
    try
    {
        var addCategoryCol = isPostgres
            ? """ALTER TABLE "Flashcards" ADD COLUMN IF NOT EXISTS "CategoryId" INTEGER NULL REFERENCES "FlashcardCategories"("Id") ON DELETE SET NULL"""
            : """ALTER TABLE "Flashcards" ADD COLUMN "CategoryId" INTEGER NULL REFERENCES "FlashcardCategories"("Id") ON DELETE SET NULL""";
        await ctx.Database.ExecuteSqlRawAsync(addCategoryCol);
    }
    catch { /* column already exists */ }

    // Seed default categories once
    var hasDefaults = await ctx.FlashcardCategories.AnyAsync(c => c.IsDefault);
    if (!hasDefaults)
    {
        ctx.FlashcardCategories.AddRange(
            new LangoSoft.Api.Models.FlashcardCategory { Name = "beautiful", IsDefault = true, Color = "#f472b6" },
            new LangoSoft.Api.Models.FlashcardCategory { Name = "weird",     IsDefault = true, Color = "#a855f7" },
            new LangoSoft.Api.Models.FlashcardCategory { Name = "difficult", IsDefault = true, Color = "#f59e0b" }
        );
        await ctx.SaveChangesAsync();
    }
}

// Book import downloads from Gutenberg — run in background so the server
// starts accepting requests immediately instead of blocking for 10-60 s.
_ = Task.Run(async () =>
{
    await Task.Delay(500); // let the server bind to the port first
    using var scope = app.Services.CreateScope();
    var importService = scope.ServiceProvider.GetRequiredService<BookImportService>();
    await importService.ImportAllBooksAsync();
});

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors();
app.MapControllers();

var port = Environment.GetEnvironmentVariable("PORT") ?? "5000";
app.Run($"http://0.0.0.0:{port}");
