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

// DB migration is synchronous (fast, no network) — do it before serving requests.
using (var scope = app.Services.CreateScope())
{
    var ctx = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    await ctx.Database.EnsureCreatedAsync();
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
