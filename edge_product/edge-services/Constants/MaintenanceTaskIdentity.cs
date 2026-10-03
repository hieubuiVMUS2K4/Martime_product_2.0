using System.Globalization;
using System.Security.Cryptography;
using System.Text;

namespace MaritimeEdge.Constants;

public static class MaintenanceTaskIdentity
{
    public static string Create(Guid scheduleId, string scheduleCode, string equipmentCode, DateTime generatedAt)
    {
        var date = generatedAt.ToString("yyyyMMdd", CultureInfo.InvariantCulture);
        var legacy = $"SCHED-{scheduleCode}-{equipmentCode}-{date}";
        if (legacy.Length <= 50) return legacy;

        // Retain a readable prefix; hash the full identity rather than truncate unique data.
        var digest = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes($"{scheduleId:N}|{scheduleCode}|{equipmentCode}|{date}")))[..24];
        return $"SCHED-{scheduleCode[..Math.Min(8, scheduleCode.Length)]}-{digest}-{date}";
    }
}
