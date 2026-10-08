// ============================================================
// Type Re-exports from Maritime.Shared
// ============================================================
// This file maps shared library types into the MaritimeEdge.Models namespace
// so all existing controllers, services, and DbContext continue to work
// without requiring namespace changes throughout edge-services.
//
// SINGLE SOURCE OF TRUTH: All crew/certificate/document/sync models
// are defined ONCE in Maritime.Shared and re-exported here.
// ============================================================

// Sync enums and models
global using SyncActionType = Maritime.Shared.Models.Sync.SyncActionType;
global using SyncPriority = Maritime.Shared.Models.Sync.SyncPriority;
global using NetworkType = Maritime.Shared.Models.Sync.NetworkType;
global using SyncQueue = Maritime.Shared.Models.Sync.SyncQueue;
global using SyncState = Maritime.Shared.Models.Sync.SyncState;

// Crew models
global using CrewMember = Maritime.Shared.Models.Crew.CrewMember;
global using CrewLogbookEntry = Maritime.Shared.Models.Crew.CrewLogbookEntry;
global using Certificate = Maritime.Shared.Models.Crew.Certificate;
global using CrewCertificate = Maritime.Shared.Models.Crew.CrewCertificate;
global using Country = Maritime.Shared.Models.Crew.Country;
global using Rank = Maritime.Shared.Models.Crew.Rank;
global using RankCertificate = Maritime.Shared.Models.Crew.RankCertificate;
global using CountryCertificate = Maritime.Shared.Models.Crew.CountryCertificate;
global using ServiceRecord = Maritime.Shared.Models.Crew.ServiceRecord;

// Document models
global using CrewMemberDocument = Maritime.Shared.Models.Documents.CrewMemberDocument;
global using CrewDocumentCategory = Maritime.Shared.Models.Documents.CrewDocumentCategory;
