using Npgsql;
using PmsDemoReset;

static string Required(string key) => Environment.GetEnvironmentVariable(key) is { Length: > 0 } value ? value : throw new InvalidOperationException($"Missing {key}");
try
{
    var edgeConnection = Required("PMS_RESET_EDGE_CONNECTION"); var shoreConnection = Required("PMS_RESET_SHORE_CONNECTION");
    var node = Required("PMS_RESET_NODE"); var vessel = Guid.Parse(Required("PMS_RESET_VESSEL_ID"));
    var dataset = Guid.Parse(Required("PMS_RESET_DATASET_ID"));
    if (dataset == Guid.Empty) throw new InvalidOperationException("Dataset ID must be non-empty and reused when resuming the same reset.");
    var reset = new DemoResetCoordinator(edgeConnection, shoreConnection);
    var preview = await reset.PreviewAsync(node, vessel);
    Console.WriteLine(System.Text.Json.JsonSerializer.Serialize(preview, new System.Text.Json.JsonSerializerOptions { WriteIndented = true }));
    if (args.SequenceEqual(new[] { "--apply" }))
    {
        var confirmation = $"{node}/{new NpgsqlConnectionStringBuilder(edgeConnection).Database}/{new NpgsqlConnectionStringBuilder(shoreConnection).Database}";
        if (Required("PMS_RESET_CONFIRM") != confirmation) throw new InvalidOperationException("Confirmation must match node/EdgeDatabase/ShoreDatabase.");
        await reset.ApplyAsync(node, vessel, dataset);
        Console.WriteLine("PMS demo reset completed. Equipment, materials, stocks, counters and shared signing evidence were preserved.");
    }
    else if (args.Length != 0 && !args.SequenceEqual(new[] { "--preview" })) throw new InvalidOperationException("Use --preview (default) or --apply.");
}
catch (Exception error) { Console.Error.WriteLine(error.Message); Environment.ExitCode = 1; }
