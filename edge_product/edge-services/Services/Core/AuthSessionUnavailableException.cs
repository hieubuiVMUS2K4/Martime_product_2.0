namespace MaritimeEdge.Services.Core;

// A failed database/service call does not establish that credentials are invalid.
public sealed class AuthSessionUnavailableException(Exception innerException)
    : Exception("Session service temporarily unavailable.", innerException);
