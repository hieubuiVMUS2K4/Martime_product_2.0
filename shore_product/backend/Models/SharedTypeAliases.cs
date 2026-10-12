// ============================================================
// SHARED TYPE ALIASES FOR BACKEND (SHORE)
// Maps Maritime.Shared types into global scope so existing code
// using ProductApi.Models types continues to work seamlessly.
// ============================================================

// Crew Models
global using CrewMember = Maritime.Shared.Models.Crew.CrewMember;
global using CrewCertificate = Maritime.Shared.Models.Crew.CrewCertificate;
global using CrewLogbookEntry = Maritime.Shared.Models.Crew.CrewLogbookEntry;
global using Certificate = Maritime.Shared.Models.Crew.Certificate;
global using Country = Maritime.Shared.Models.Crew.Country;
global using Rank = Maritime.Shared.Models.Crew.Rank;
global using RankCertificate = Maritime.Shared.Models.Crew.RankCertificate;
global using CountryCertificate = Maritime.Shared.Models.Crew.CountryCertificate;
global using ServiceRecord = Maritime.Shared.Models.Crew.ServiceRecord;

// Document Models
global using CrewMemberDocument = Maritime.Shared.Models.Documents.CrewMemberDocument;
global using CrewDocumentCategory = Maritime.Shared.Models.Documents.CrewDocumentCategory;

// Sync Models
global using SyncActionType = Maritime.Shared.Models.Sync.SyncActionType;
global using SyncPriority = Maritime.Shared.Models.Sync.SyncPriority;
global using NetworkType = Maritime.Shared.Models.Sync.NetworkType;
global using SyncQueue = Maritime.Shared.Models.Sync.SyncQueue;
global using SyncOutbox = Maritime.Shared.Models.Sync.SyncOutbox;
global using SyncLog = Maritime.Shared.Models.Sync.SyncLog;

// Shared DTOs
global using CrewMemberDto = Maritime.Shared.DTOs.Crew.CrewMemberDto;
global using RankDto = Maritime.Shared.DTOs.Crew.RankDto;
global using CrewDetailDto = Maritime.Shared.DTOs.Crew.CrewDetailDto;
global using CreateCrewRequest = Maritime.Shared.DTOs.Crew.CreateCrewRequest;
global using UpdateCrewRequest = Maritime.Shared.DTOs.Crew.UpdateCrewRequest;
global using CertificateDto = Maritime.Shared.DTOs.Crew.CertificateDto;
global using CrewCertificateDto = Maritime.Shared.DTOs.Crew.CrewCertificateDto;
global using CrewCertificateRequest = Maritime.Shared.DTOs.Crew.CrewCertificateRequest;
global using CreateCertificateRequest = Maritime.Shared.DTOs.Crew.CreateCertificateRequest;
global using CreateIdentityDocumentDto = Maritime.Shared.DTOs.Crew.CreateIdentityDocumentDto;

// Shared Sync DTOs
// NOTE: SyncQueueItemDto alias commented out — conflicts with existing local class
// in SyncController.cs. Will be unified in Phase 3 (Sync Implementation).
// global using SyncQueueItemDto = Maritime.Shared.DTOs.Sync.SyncQueueItemDto;
global using SyncPullResponse = Maritime.Shared.DTOs.Sync.SyncPullResponse;
global using SyncStatusDto = Maritime.Shared.DTOs.Sync.SyncStatusDto;
global using SyncAcknowledgeDto = Maritime.Shared.DTOs.Sync.SyncAcknowledgeDto;
