using System.Globalization;
using System.Reflection;
using System.Text.Json;
using ProductApi.Models;

namespace ProductApi.Services
{
    /// <summary>
    /// Thông số tàu (Vessel ở bờ ↔ ShipData ở tàu) — đồng bộ hai chiều theo từng trường.
    ///
    /// Tàu → bờ: tàu gửi bảng <c>ship_data</c> chỉ gồm các cột vừa đổi (SyncInboxService.ProcessShipDataAsync).
    /// Bờ → tàu: bờ sửa ở màn chi tiết tàu, gửi lại <c>ship_data</c> cũng chỉ gồm các cột vừa đổi,
    /// đặt tên theo ShipData của tàu. Hai bên sửa cùng một trường thì bản sửa sau thắng.
    /// </summary>
    public static class VesselParticulars
    {
        public const string SyncTable = "ship_data";

        /// <summary>Trường đặt tên khác nhau giữa Vessel (bờ) và ShipData (tàu). Còn lại trùng tên.</summary>
        private static readonly Dictionary<string, string> ShoreToEdge = new(StringComparer.OrdinalIgnoreCase)
        {
            ["Name"] = "ShipName",
            ["VesselType"] = "TypeOfVessel",
            ["IMO"] = "ImoNumber",
        };

        /// <summary>Không sửa qua màn thông số: khóa, mốc thời gian, IMO (định danh tàu, gắn với gói kết nối).</summary>
        private static readonly HashSet<string> NotEditable = new(StringComparer.OrdinalIgnoreCase)
        {
            "Id", "IMO", "CreatedAt", "UpdatedAt", "LastShoreSyncAt", "LastEdgeSyncAt", "FieldOwnership",
        };

        /// <summary>Chỉ có ý nghĩa ở bờ — sửa được nhưng không gửi xuống tàu.</summary>
        private static readonly HashSet<string> ShoreOnly = new(StringComparer.OrdinalIgnoreCase)
        {
            "IsActive",
        };

        /// <summary>Trường bắt buộc có giá trị (không để trống).</summary>
        private static readonly HashSet<string> Required = new(StringComparer.OrdinalIgnoreCase)
        {
            "Name", "CallSign",
        };

        private static readonly HashSet<Type> ScalarTypes = new()
        {
            typeof(string), typeof(bool), typeof(int), typeof(long), typeof(double), typeof(decimal), typeof(DateTime),
        };

        /// <summary>Các thuộc tính của Vessel sửa được qua màn thông số (tra không phân biệt hoa thường).</summary>
        public static readonly IReadOnlyDictionary<string, PropertyInfo> Editable = typeof(Vessel)
            .GetProperties(BindingFlags.Public | BindingFlags.Instance)
            .Where(p => p.CanRead && p.CanWrite && !NotEditable.Contains(p.Name)
                        && ScalarTypes.Contains(Nullable.GetUnderlyingType(p.PropertyType) ?? p.PropertyType))
            .ToDictionary(p => p.Name, p => p, StringComparer.OrdinalIgnoreCase);

        /// <summary>Toàn bộ thông số để hiện ở màn chi tiết tàu (khóa camelCase, gồm cả IMO và mốc đồng bộ).</summary>
        public static Dictionary<string, object?> Read(Vessel vessel)
        {
            var result = Editable.Values.ToDictionary(p => JsonNamingPolicy.CamelCase.ConvertName(p.Name), p => p.GetValue(vessel));
            result["id"] = vessel.Id;
            result["imo"] = vessel.IMO;
            result["updatedAt"] = vessel.UpdatedAt;
            result["lastEdgeSyncAt"] = vessel.LastEdgeSyncAt;
            result["lastShoreSyncAt"] = vessel.LastShoreSyncAt;
            return result;
        }

        public static string ToEdgeName(string shoreProperty) =>
            ShoreToEdge.TryGetValue(shoreProperty, out var edge) ? edge : shoreProperty;

        public static bool SyncsToEdge(string shoreProperty) => !ShoreOnly.Contains(shoreProperty);

        /// <summary>
        /// Áp các trường trong <paramref name="payload"/> lên <paramref name="vessel"/>.
        /// Trả về các trường thực sự đổi (tên theo Vessel). Trường lạ bị bỏ qua; giá trị sai kiểu ném ArgumentException.
        /// </summary>
        public static Dictionary<string, object?> Apply(Vessel vessel, JsonElement payload)
        {
            if (payload.ValueKind != JsonValueKind.Object)
                throw new ArgumentException("Dữ liệu gửi lên phải là một đối tượng JSON.");

            var changes = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
            foreach (var field in payload.EnumerateObject())
            {
                if (!Editable.TryGetValue(field.Name, out var prop)) continue;

                var value = Convert(field.Value, prop.PropertyType, prop.Name);
                if (Required.Contains(prop.Name) && value is null)
                    throw new ArgumentException($"Trường {prop.Name} không được để trống.");

                if (Equals(prop.GetValue(vessel), value)) continue;
                prop.SetValue(vessel, value);
                changes[prop.Name] = value;
            }
            return changes;
        }

        /// <summary>Gói vá gửi xuống tàu: tên trường theo ShipData, luôn kèm IMO để tàu đối chiếu.</summary>
        public static Dictionary<string, object?> BuildEdgePatch(Vessel vessel, IReadOnlyDictionary<string, object?> changes)
        {
            var patch = changes
                .Where(c => SyncsToEdge(c.Key))
                .ToDictionary(c => ToEdgeName(c.Key), c => c.Value);
            if (patch.Count > 0) patch["ImoNumber"] = vessel.IMO;
            return patch;
        }

        private static object? Convert(JsonElement value, Type type, string name)
        {
            var target = Nullable.GetUnderlyingType(type) ?? type;
            var nullable = !type.IsValueType || Nullable.GetUnderlyingType(type) != null;

            if (value.ValueKind == JsonValueKind.Null || (value.ValueKind == JsonValueKind.String && string.IsNullOrWhiteSpace(value.GetString())))
            {
                if (target == typeof(string)) return null;
                if (nullable) return null;
                if (target == typeof(bool)) return false;
                throw new ArgumentException($"Trường {name} không được để trống.");
            }

            try
            {
                if (target == typeof(string))
                    return value.ValueKind == JsonValueKind.String ? value.GetString()!.Trim() : value.GetRawText();
                if (target == typeof(bool))
                    return value.ValueKind is JsonValueKind.True or JsonValueKind.False
                        ? value.GetBoolean()
                        : bool.Parse(value.GetString()!);
                if (target == typeof(DateTime))
                {
                    var dt = DateTime.Parse(value.GetString()!, CultureInfo.InvariantCulture, DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal);
                    return DateTime.SpecifyKind(dt, DateTimeKind.Utc);
                }

                var text = value.ValueKind == JsonValueKind.Number ? value.GetRawText() : value.GetString()!.Trim();
                if (target == typeof(int)) return int.Parse(text, NumberStyles.Integer, CultureInfo.InvariantCulture);
                if (target == typeof(long)) return long.Parse(text, NumberStyles.Integer, CultureInfo.InvariantCulture);
                if (target == typeof(double)) return double.Parse(text, NumberStyles.Float, CultureInfo.InvariantCulture);
                if (target == typeof(decimal)) return decimal.Parse(text, NumberStyles.Float, CultureInfo.InvariantCulture);
            }
            catch (Exception ex) when (ex is FormatException or OverflowException or InvalidOperationException)
            {
                throw new ArgumentException($"Giá trị của trường {name} không hợp lệ.");
            }

            throw new ArgumentException($"Trường {name} có kiểu không hỗ trợ.");
        }
    }
}
