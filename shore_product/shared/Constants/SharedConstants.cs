namespace Maritime.Shared.Constants;

/// <summary>
/// Department constants for crew organization.
/// Based on standard maritime vessel organizational structure.
/// </summary>
public static class Department
{
    public const string ENGINE = "ENGINE";
    public const string DECK = "DECK";
    public const string NAVIGATION = "NAVIGATION";
    public const string MANAGEMENT = "MANAGEMENT";
    public const string ELECTRICAL = "ELECTRICAL";
    public const string CATERING = "CATERING";
}

/// <summary>
/// Certificate category constants (STCW compliance)
/// </summary>
public static class CertificateCategory
{
    public const string COMPETENCY = "COMPETENCY";
    public const string MEDICAL = "MEDICAL";
    public const string PROFICIENCY = "PROFICIENCY";
    public const string SAFETY = "SAFETY";
    public const string SECURITY = "SECURITY";
}

/// <summary>
/// Certificate status values
/// </summary>
public static class CertificateStatus
{
    public const string VALID = "VALID";
    public const string EXPIRING_SOON = "EXPIRING_SOON";
    public const string EXPIRED = "EXPIRED";
    public const string SUSPENDED = "SUSPENDED";
    public const string REVOKED = "REVOKED";
}

/// <summary>
/// Sync-related constants
/// </summary>
public static class SyncConstants
{
    // Table names used in sync queue (snake_case matching DB convention)
    public const string TABLE_CREW_MEMBERS = "crew_members";
    public const string TABLE_CERTIFICATES = "certificates";
    public const string TABLE_CREW_CERTIFICATES = "crew_certificates";
    public const string TABLE_COUNTRIES = "countries";
    public const string TABLE_RANKS = "ranks";
    public const string TABLE_RANK_CERTIFICATES = "rank_certificates";
    public const string TABLE_COUNTRY_CERTIFICATES = "country_certificates";
    public const string TABLE_CREW_MEMBER_DOCUMENTS = "crew_member_documents";
    public const string TABLE_SERVICE_RECORDS = "service_records";

    // Default node identifiers
    public const string NODE_SHORE = "SHORE";
    public const string NODE_SHIP_PREFIX = "SHIP_";

    // Sync batch sizes
    public const int DEFAULT_BATCH_SIZE = 50;
    public const int MAX_BATCH_SIZE = 200;

    // Retry configuration
    public const int MAX_RETRY_COUNT = 5;
    public const int BASE_RETRY_DELAY_SECONDS = 60;
}
