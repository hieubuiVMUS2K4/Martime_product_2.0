using Npgsql;

namespace PmsDemoReset;

/// <summary>Catalog-driven reset; no dependency on either backend's different Maritime.Shared assembly.</summary>
public sealed class DemoResetCoordinator(string edgeConnection, string shoreConnection)
{
    private static readonly HashSet<string> Allowed = ["maintenance_tasks", "maintenance_task_details", "task_checklist_items", "maintenance_schedules",
        "schedule_spare_parts", "schedule_checklist_templates", "maintenance_histories", "task_deferral_requests", "task_status_history",
        "task_risk_assessments", "task_inspection_reports", "pms_work_order_reports", "pms_work_order_material_postings",
        // Shore's legacy EF models use these physical names; they are not extra business tables.
        "MaintenanceTasks", "task_deferral_request"];
    private static string Q(string name) => '"' + name.Replace("\"", "\"\"") + '"';
    private sealed record FK(string Child, string Parent, string[] ChildColumns, string[] ParentColumns);
    private sealed record Catalog(Dictionary<string, string[]> Tables, List<FK> Keys)
    {
        public string Col(string table, string name) => Tables[table].Single(c => c.Replace("_", "").Equals(name.Replace("_", ""), StringComparison.OrdinalIgnoreCase));
        public bool Has(string table, string name) => Tables[table].Any(c => c.Replace("_", "").Equals(name.Replace("_", ""), StringComparison.OrdinalIgnoreCase));
    }
    private static async Task<object?> Run(NpgsqlConnection db, NpgsqlTransaction? tx, string sql, params (string, object)[] args)
    {
        await using var cmd = new NpgsqlCommand(sql, db, tx);
        foreach (var (key, value) in args) cmd.Parameters.AddWithValue(key, value);
        return await cmd.ExecuteScalarAsync();
    }
    private static async Task<Catalog> ReadCatalog(NpgsqlConnection db, NpgsqlTransaction? tx = null)
    {
        var tables = new Dictionary<string, List<string>>(); var keys = new List<FK>();
        await using (var cmd = new NpgsqlCommand("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' ORDER BY ordinal_position", db, tx))
        await using (var reader = await cmd.ExecuteReaderAsync())
            while (await reader.ReadAsync()) { var t = reader.GetString(0); if (!tables.ContainsKey(t)) tables[t] = []; tables[t].Add(reader.GetString(1)); }
        await using (var cmd = new NpgsqlCommand("""
            SELECT child.relname,parent.relname,array_agg(ca.attname::text ORDER BY k.ord),array_agg(pa.attname::text ORDER BY k.ord)
            FROM pg_constraint f JOIN pg_class child ON child.oid=f.conrelid JOIN pg_namespace ns ON ns.oid=child.relnamespace
            JOIN pg_class parent ON parent.oid=f.confrelid JOIN pg_namespace ps ON ps.oid=parent.relnamespace
            CROSS JOIN LATERAL unnest(f.conkey,f.confkey) WITH ORDINALITY k(c,p,ord)
            JOIN pg_attribute ca ON ca.attrelid=child.oid AND ca.attnum=k.c JOIN pg_attribute pa ON pa.attrelid=parent.oid AND pa.attnum=k.p
            WHERE f.contype='f' AND ps.nspname='public' AND ns.nspname='public' GROUP BY f.oid,child.relname,parent.relname
            """, db, tx))
        await using (var reader = await cmd.ExecuteReaderAsync())
            while (await reader.ReadAsync()) keys.Add(new(reader.GetString(0), reader.GetString(1), reader.GetFieldValue<string[]>(2), reader.GetFieldValue<string[]>(3)));
        // Cross-schema references are not included above, so refuse them rather than risk CASCADE.
        if ((long)(await Run(db, tx, "SELECT count(*) FROM pg_constraint f JOIN pg_class p ON p.oid=f.confrelid JOIN pg_namespace ps ON ps.oid=p.relnamespace JOIN pg_class c ON c.oid=f.conrelid JOIN pg_namespace cs ON cs.oid=c.relnamespace WHERE f.contype='f' AND ps.nspname='public' AND cs.nspname<>'public' AND p.relname=ANY(@tables)", ("tables", Allowed.ToArray())))! > 0)
            throw new InvalidOperationException("Cross-schema references to PMS tables require manual review.");
        var catalog = new Catalog(tables.ToDictionary(p => p.Key, p => p.Value.ToArray()), keys);
        // The deployed Shore history mirror has logical parent IDs but no physical FK.
        // Model only these reviewed relationships; never infer arbitrary Id-like columns.
        void LogicalHistoryParent(string childColumn, string parent)
        {
            const string child = "maintenance_histories";
            if (!catalog.Tables.ContainsKey(child) || !catalog.Tables.ContainsKey(parent) || !catalog.Has(child, childColumn) || !catalog.Has(parent, "Id")) return;
            var column = catalog.Col(child, childColumn);
            if (!keys.Any(k => k.Child == child && k.ChildColumns.Contains(column)))
                keys.Add(new(child, parent, [column], [catalog.Col(parent, "Id")]));
        }
        LogicalHistoryParent("ScheduleId", "maintenance_schedules");
        LogicalHistoryParent("TaskId", catalog.Tables.ContainsKey("MaintenanceTasks") ? "MaintenanceTasks" : "maintenance_tasks");
        return catalog;
    }
    private static string Join(FK fk, string c, string p) => string.Join(" AND ", fk.ChildColumns.Select((col, i) => $"{c}.{Q(col)}={p}.{Q(fk.ParentColumns[i])}"));
    private static string Scope(Catalog cat, string table, string alias, bool all, HashSet<string>? path = null)
    {
        if (all) return "TRUE";
        if (cat.Has(table, "VesselId")) return $"{alias}.{Q(cat.Col(table, "VesselId"))}=@vessel";
        path = path == null ? [] : new(path);
        if (!path.Add(table)) throw new InvalidOperationException("Cyclic PMS foreign keys require manual review.");
        var clauses = cat.Keys.Where(f => f.Child == table && Allowed.Contains(f.Parent)).Select(f =>
            $"EXISTS(SELECT 1 FROM public.{Q(f.Parent)} p{path.Count} WHERE {Join(f, alias, "p" + path.Count)} AND ({Scope(cat, f.Parent, "p" + path.Count, false, path)}))").ToArray();
        if (clauses.Length == 0) throw new InvalidOperationException($"Cannot prove vessel scope for {table}; refusing reset.");
        return string.Join(" OR ", clauses);
    }
    private static async Task Delete(NpgsqlConnection db, NpgsqlTransaction tx, Catalog cat, Guid vessel, bool all)
    {
        var tables = cat.Tables.Keys.Where(Allowed.Contains).ToHashSet();
        if (tables.Count == 0) throw new InvalidOperationException("No PMS tables found; refusing reset.");
        await Run(db, tx, $"LOCK TABLE {string.Join(",", tables.Order().Select(t => "public." + Q(t)))} IN SHARE ROW EXCLUSIVE MODE");
        cat = await ReadCatalog(db, tx); tables = cat.Tables.Keys.Where(Allowed.Contains).ToHashSet();
        var lockTables = tables.Concat(cat.Keys.Where(f => tables.Contains(f.Parent)).Select(f => f.Child)).Distinct().Order().ToArray();
        await Run(db, tx, $"LOCK TABLE {string.Join(",", lockTables.Select(t => "public." + Q(t)))} IN SHARE ROW EXCLUSIVE MODE");
        foreach (var fk in cat.Keys.Where(f => tables.Contains(f.Parent)))
        {
            var outside = tables.Contains(fk.Child) ? $"NOT COALESCE(({Scope(cat, fk.Child, "c", all)}),false)" : "TRUE";
            if ((long)(await Run(db, tx, $"SELECT count(*) FROM public.{Q(fk.Child)} c JOIN public.{Q(fk.Parent)} p ON {Join(fk, "c", "p")} WHERE ({Scope(cat, fk.Parent, "p", all)}) AND ({outside})", ("vessel", vessel)))! > 0)
                throw new InvalidOperationException($"Reset would affect external/cross-vessel references in {fk.Child}; aborting.");
            if (!all && tables.Contains(fk.Child) && (long)(await Run(db, tx,
                $"SELECT count(*) FROM public.{Q(fk.Child)} c JOIN public.{Q(fk.Parent)} p ON {Join(fk, "c", "p")} WHERE ({Scope(cat, fk.Child, "c", false)}) AND NOT COALESCE(({Scope(cat, fk.Parent, "p", false)}),false)", ("vessel", vessel)))! > 0)
                throw new InvalidOperationException($"Conflicting vessel ownership through {fk.Child}; aborting.");
        }
        var seen = new HashSet<string>(); var ordered = new List<string>();
        void Visit(string t) { if (!seen.Add(t)) return; foreach (var child in cat.Keys.Where(f => f.Parent == t && tables.Contains(f.Child))) Visit(child.Child); ordered.Add(t); }
        foreach (var t in tables) Visit(t);
        foreach (var t in ordered) await Run(db, tx, $"DELETE FROM public.{Q(t)} t WHERE {Scope(cat, t, "t", all)}", ("vessel", vessel));
    }
    private static async Task RestoreEquipment(NpgsqlConnection db, NpgsqlTransaction tx, Catalog cat)
    {
        const string table = "equipment_assets";
        if (!cat.Tables.ContainsKey(table) || !cat.Has(table, "MaintenancePreviousStatus")) return;
        var prior = Q(cat.Col(table, "MaintenancePreviousStatus")); var id = Q(cat.Col(table, "Id"));
        var rows = new List<(Guid, string)>();
        await using (var cmd = new NpgsqlCommand($"SELECT {id},{prior} FROM {Q(table)} WHERE {prior} IS NOT NULL", db, tx))
        await using (var reader = await cmd.ExecuteReaderAsync()) while (await reader.ReadAsync()) rows.Add((reader.GetGuid(0), reader.GetString(1)));
        foreach (var (assetId, status) in rows)
        {
            await Run(db, tx, $"UPDATE {Q(table)} SET {Q(cat.Col(table, "Status"))}=@status,{prior}=NULL,{Q(cat.Col(table, "IsSynced"))}=false WHERE {id}=@id", ("status", status), ("id", assetId));
            var fields = new[] { "EventId", "TableName", "RecordKey", "ActionType", "Payload", "Priority", "RetryCount", "MaxRetries", "CreatedAt" };
            var columns = string.Join(",", fields.Select(f => Q(cat.Col("sync_queue", f))));
            var payload = System.Text.Json.JsonSerializer.Serialize(new { Id = assetId, Status = status, MaintenancePreviousStatus = (string?)null });
            await Run(db, tx, $"INSERT INTO sync_queue({columns}) VALUES(@event,'equipment_asset',@key,1,@payload,2,0,5,now())", ("event", Guid.NewGuid()), ("key", assetId.ToString()), ("payload", payload));
        }
    }
    private static async Task Validate(NpgsqlConnection edge, NpgsqlConnection shore, Catalog ec, Catalog sc, string node, Guid vessel)
    {
        if ((long)(await Run(shore, null, "SELECT count(*) FROM sync_node_trackers WHERE \"NodeId\"=@node AND \"VesselId\"=@vessel AND \"IsRegistered\" AND NOT \"IsRevoked\"", ("node", node), ("vessel", vessel)))! != 1)
            throw new InvalidOperationException("Shore node/vessel binding does not match.");
        const string profile = "edge_provisioning_profile";
        if ((long)(await Run(edge, null, $"SELECT count(*) FROM {Q(profile)} WHERE {Q(ec.Col(profile, "IsActive"))} AND {Q(ec.Col(profile, "NodeId"))}=@node AND {Q(ec.Col(profile, "VesselId"))}=@vessel", ("node", node), ("vessel", vessel)))! != 1)
            throw new InvalidOperationException("Edge active provisioning profile does not match.");
        if (!sc.Tables.ContainsKey("pms_sync_datasets")) throw new InvalidOperationException("Install the Shore PMS dataset migration first.");
    }
    public async Task<Dictionary<string, long>> PreviewAsync(string node, Guid vessel)
    {
        await using var edge = new NpgsqlConnection(edgeConnection); await edge.OpenAsync(); await using var shore = new NpgsqlConnection(shoreConnection); await shore.OpenAsync();
        var ec = await ReadCatalog(edge); var sc = await ReadCatalog(shore); await Validate(edge, shore, ec, sc, node, vessel);
        var counts = new Dictionary<string, long>();
        foreach (var (db, cat, prefix, all) in new[] { (edge, ec, "edge", true), (shore, sc, "shore", false) })
        foreach (var t in cat.Tables.Keys.Where(Allowed.Contains)) counts[$"{prefix}:{t}"] = (long)(await Run(db, null, $"SELECT count(*) FROM public.{Q(t)} t WHERE {Scope(cat, t, "t", all)}", ("vessel", vessel)))!;
        return counts;
    }
    public async Task ApplyAsync(string node, Guid vessel, Guid dataset)
    {
        if (dataset == Guid.Empty) throw new ArgumentException("Non-empty dataset is required.");
        await using var edge = new NpgsqlConnection(edgeConnection); await edge.OpenAsync(); await using var shore = new NpgsqlConnection(shoreConnection); await shore.OpenAsync();
        var ec = await ReadCatalog(edge); var sc = await ReadCatalog(shore); await Validate(edge, shore, ec, sc, node, vessel);
        var st = ec.Tables.ContainsKey("sync_state") ? "sync_state" : "sync_states";
        var key = Q(ec.Col(st, "Key")); var value = Q(ec.Col(st, "Value")); var updated = Q(ec.Col(st, "UpdatedAt"));
        async Task<string?> Get(string k) => (string?)await Run(edge, null, $"SELECT {value} FROM {Q(st)} WHERE {key}=@key", ("key", k));
        async Task Put(NpgsqlTransaction tx, string k, string v) => await Run(edge, tx, $"INSERT INTO {Q(st)}({key},{value},{updated}) VALUES(@key,@value,now()) ON CONFLICT({key}) DO UPDATE SET {value}=excluded.{value},{updated}=now()", ("key", k), ("value", v));
        var old = await Get("pms-dataset-id");
        var registered = (Guid?)await Run(shore, null, "SELECT \"DatasetId\" FROM pms_sync_datasets WHERE \"OriginNode\"=@node", ("node", node));
        var active = (bool?)await Run(shore, null, "SELECT \"IsActive\" FROM pms_sync_datasets WHERE \"OriginNode\"=@node", ("node", node)) ?? false;
        if (old != null && old != dataset.ToString() || registered.HasValue && registered != dataset) throw new InvalidOperationException("Another dataset is installed; this tool resets legacy demo data once.");
        if (old != null && await Get("pms-cutover-state") == "ACTIVE") { if (active) return; throw new InvalidOperationException("Edge active but Shore inactive; refusing destructive retry."); }
        if (active && old == null) throw new InvalidOperationException("Shore active but Edge marker missing; independent restore requires review.");
        var streamText = await Get("sync-stream-id");
        var preparedStream = (Guid?)await Run(shore, null, "SELECT \"StreamId\" FROM pms_sync_datasets WHERE \"OriginNode\"=@node", ("node", node));
        var stream = streamText == null ? preparedStream ?? Guid.NewGuid() : Guid.Parse(streamText);
        await using (var tx = await shore.BeginTransactionAsync())
        {
            await Run(shore, tx, "SELECT pg_advisory_xact_lock(hashtextextended(@node,0))", ("node", node));
            await Run(shore, tx, "INSERT INTO pms_sync_datasets(\"OriginNode\",\"VesselId\",\"DatasetId\",\"StreamId\",\"IsActive\",\"CreatedAt\") VALUES(@node,@vessel,@dataset,@stream,false,now()) ON CONFLICT(\"OriginNode\") DO NOTHING", ("node", node), ("vessel", vessel), ("dataset", dataset), ("stream", stream));
            if ((long)(await Run(shore, tx, "SELECT count(*) FROM pms_sync_datasets WHERE \"OriginNode\"=@node AND \"VesselId\"=@vessel AND \"DatasetId\"=@dataset AND \"StreamId\"=@stream", ("node", node), ("vessel", vessel), ("dataset", dataset), ("stream", stream)))! != 1) throw new InvalidOperationException("Reset identity changed during preparation.");
            await tx.CommitAsync();
        }
        if (old == null)
        {
            await using var tx = await edge.BeginTransactionAsync(); await Run(edge, tx, "SELECT pg_advisory_xact_lock(7311042026)");
            var current = (string?)await Run(edge, tx, $"SELECT {value} FROM {Q(st)} WHERE {key}='pms-dataset-id'");
            if (current == null)
            {
                await Delete(edge, tx, ec, vessel, true);
                await RestoreEquipment(edge, tx, ec);
                var names = Allowed.Concat(Allowed.Select(t => t.EndsWith("ies") ? t[..^3] + "y" : t.TrimEnd('s'))).Distinct().ToArray();
                await Run(edge, tx, $"DELETE FROM sync_queue WHERE {Q(ec.Col("sync_queue", "TableName"))}=ANY(@tables)", ("tables", names));
                await Put(tx, "pms-dataset-id", dataset.ToString()); await Put(tx, "pms-cutover-state", "PREPARED");
                if (streamText == null) await Put(tx, "sync-stream-id", stream.ToString());
                await Run(edge, tx, $"DELETE FROM {Q(st)} WHERE {key}='pms-peer-ready'");
            }
            else if (current != dataset.ToString()) throw new InvalidOperationException("Another reset completed while waiting for the Edge writer lock.");
            await tx.CommitAsync();
        }
        await using (var tx = await shore.BeginTransactionAsync())
        {
            await Run(shore, tx, "SELECT pg_advisory_xact_lock(hashtextextended(@node,0))", ("node", node));
            if (!(bool)(await Run(shore, tx, "SELECT \"IsActive\" FROM pms_sync_datasets WHERE \"OriginNode\"=@node", ("node", node)))!)
            { await Delete(shore, tx, sc, vessel, false); await Run(shore, tx, "UPDATE pms_sync_datasets SET \"IsActive\"=true WHERE \"OriginNode\"=@node", ("node", node)); }
            await tx.CommitAsync();
        }
        await using (var tx = await edge.BeginTransactionAsync()) { await Run(edge, tx, "SELECT pg_advisory_xact_lock(7311042026)"); await Put(tx, "pms-cutover-state", "ACTIVE"); await tx.CommitAsync(); }
    }
}
