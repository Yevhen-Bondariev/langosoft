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
    builder.Services.AddDbContext<AppDbContext>(o => o.UseNpgsql(dbUrl));
else
    builder.Services.AddDbContext<AppDbContext>(o => o.UseSqlite("Data Source=langosoft.db"));

builder.Services.AddHttpClient();
builder.Services.AddScoped<BookImportService>();
builder.Services.AddScoped<SpacedRepetitionService>();
builder.Services.AddScoped<EssayService>();
builder.Services.AddScoped<WordService>();

builder.Services.AddCors(options =>
    options.AddDefaultPolicy(policy =>
        policy.WithOrigins(
                "http://localhost:5173",
                "http://localhost:5174",
                "https://yevhen-bondariev.github.io")
              .AllowAnyHeader()
              .AllowAnyMethod()));

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var ctx = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    if (string.IsNullOrEmpty(dbUrl))
        await ctx.Database.MigrateAsync();
    else
        await ctx.Database.EnsureCreatedAsync();

    var importService = scope.ServiceProvider.GetRequiredService<BookImportService>();
    await importService.ImportAllBooksAsync();
}

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors();
app.MapControllers();

var port = Environment.GetEnvironmentVariable("PORT") ?? "5000";
app.Run($"http://0.0.0.0:{port}");
