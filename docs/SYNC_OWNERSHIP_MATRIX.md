# 📊 Sync Ownership Matrix: Shore ↔ Edge

> Historical design (April 2026). Some entity names, permissions and conflict policies below differ from the current implementation. See [the October review](SYNC_LOGIC_REVIEW_2026-10-06.md) and [implemented fixes](SYNC_DIRECTION_FIXES_2026-10-06.md) before using this matrix as an implementation contract.

**Version:** 1.0  
**Date:** April 5, 2026  
**Phase:** Phase 2.2 - Bidirectional Voyage Sync  

---

## Overview

This document defines **data ownership, conflict resolution policies, and sync direction** for all synchronized entities between Shore (central system) and Edge (ship systems).

**Key Principle:**  
- **Shore** = Strategic, commercial, compliance authority
- **Edge** = Operational, real-time, real-world authority  
- **Conflicts** = Owner's version always wins (with notifications)

---

## 1️⃣ VOYAGE PLANNING DATA (Shore → Edge + bidirectional)

### VoyageRecord

| Aspect | Value | Notes |
|--------|-------|-------|
| **Owner** | 🏢 SHORE | Port State Control reqs, commercial booking |
| **Sync Direction** | ← → | Shore push + Edge acknowledge |
| **Edge Permissions** | UPDATE (fields only) | Can update status, actual dates |
| **Conflict Rule** | SHORE WINS | Commercial plan is authoritative |
| **Fields - Shore Owned** | VoyageNumber, Vessel, Ports, Commercial dates, Status |
| **Fields - Edge Owned** | ActualDeparture, ActualArrival, RealFuelBurned, Speed, Position |
| **Conflict Example** | Shore sets DepartureAtUtc=2025-04-10T10:00, Edge = 2025-04-10T10:15 | Edge value logged, Shore value synced back as PLAN |
| **Test Case** | [VoyageSyncE2ETests.cs](../Tests/Integration/VoyageSyncE2ETests.cs#L100) |

**Sync Actions:**
- CREATE: Shore creates voyage plan → Edge receives
- UPDATE: Shore modifies plan → Edge pulls latest
- DELETE: Shore cancels voyage → Edge removes (soft-delete for compliance)

---

### VoyagePlanLeg

| Aspect | Value | Notes |
|--------|-------|-------|
| **Owner** | 🏢 SHORE | Route planning, ETA, waypoint |
| **Sync Direction** | ← | Shore → Edge (one-way) |
| **Edge Permissions** | READ ONLY | View only, cannot modify |
| **Conflict Rule** | SHORE ONLY | Immutable on Edge |
| **Related** | VoyageRecord (parent) |

**Sync Actions:**
- CREATE: Shore defines voyage leg → Edge receives
- UPDATE: Shore adjusts ETA/waypoint → Edge pulls
- DELETE: Shore removes leg → Edge removes

---

### PortCall

| Aspect | Value | Notes |
|--------|-------|-------|
| **Owner** | 🏢 SHORE | Port procedures, berth, agency contact |
| **Sync Direction** | ← → | Shore push + Edge real-time status |
| **Edge Permissions** | UPDATE status | Arrival, departure timestamps |
| **Conflict Rule** | EDGE TIMESTAMP WINS | Real arrival is real |
| **Fields - Shore Owned** | PortCode, Agency, Procedures, BerthInfo, ExpectedArrival |
| **Fields - Edge Owned** | ActualArrival, ActualDeparture, CargistOpsCompleted, Incidents |
| **Conflict Example** | Shore: ExpectedArrival=Apr10 10:00, Edge ActualArrival=Apr10 11:30 | Both logged, for KPI tracking |

---

### VoyageCargoPlan

| Aspect | Value | Notes |
|--------|-------|-------|
| **Owner** | 🏢 SHORE | Cargo type, shipper, quantity, terms |
| **Sync Direction** | ← → | Shore push + Edge real-time ops |
| **Edge Permissions** | UPDATE | ActualQuantity, Operations log |
| **Conflict Rule** | SHORE QUANTITY WINS | Commercial contract |
| **Fields - Shore Owned** | CargoType, PlannedQty, Shipper, Consignee, Terms |
| **Fields - Edge Owned** | ActualQty, OperationStarted, OperationCompleted, Issues |

**Sync Actions:**
- CREATE: Shore plans cargo loading → Edge receives
- UPDATE: Shore changes plan OR Edge logs actual → Bidirectional
- DELETE: Shore removes from manifest → Edge archives

---

### VoyageBunkerPlan & VoyageCostEstimate & VoyageRevenueEstimate

| Entity | Owner | Direction | Permissions | Notes |
|--------|-------|-----------|------------|-------|
| **BunkerPlan** | 🏢 SHORE | ← → | Edge reports actual | Fuel planning vs actual burn |
| **CostEstimate** | 🏢 SHORE | ← | Shore only | Voyage profitability prediction |
| **RevenueEstimate** | 🏢 SHORE | ← | Shore only | Charter rate, freight revenue |
| **CrewChangePlan** | 🏢 SHORE | ← → | Edge confirms | Crewing logistics |
| **ExpenseRequest** | 🏢 SHORE | ← | Shore manages | Voyage cost requests |

**Conflict Example (BunkerPlan):**
```
Shore plan: 300 MT fuel consumption (estimated)
Edge actual: 285 MT (real consumption)  
→ Both recorded, Edge value drives KPIs and routing optimization
```

---

## 2️⃣ CREW DATA (Bidirectional with Rules)

### CrewMember

| Aspect | Value | Notes |
|--------|-------|-------|
| **Owner** | 🏢 SHORE (HR) ↔ ⛴️ EDGE (Operational) | Shared ownership |
| **Sync Direction** | ← → | Bidirectional |
| **Source of Truth** | SHORE for HR | Name, DOB, nationality, cert validity |
| **Source of Truth** | EDGE for onboard | IsOnboard, SignOnDate, Embark/Disembark |
| **Conflict Rule** | **FIELD-LEVEL** | HR fields → shore, ops fields → edge |
| **Fields - Shore Authoritative** | FullName, FirstName, DateOfBirth, Nationality, Certificates, NextOfKin, TaxId |
| **Fields - Edge Authoritative** | IsOnboard, SignOnDate, DisembarkDate, MusterPosition, WatchKeepingRole |

**Conflict Algorithm:**
```
If update from SHORE:
  → Apply HR fields (FullName, Cert, etc)
  → Keep Edge operational fields (IsOnboard)
  → Notify Edge of changes
  
If update from EDGE:
  → Apply operational fields (SignOnDate, IsOnboard)
  → Reject HR field changes (revert to shore version)
  → Log as warning if crew tried to modify HR data
```

**Sync Actions:**
- CREATE: Hair crew on Shore → Edge awaits confirmation → Edge confirms upon signup
- UPDATE: Shore renews cert → Edge pulls; Edge marks onboard → Shore pulls
- DELETE: Crew fired on Shore → Edge marks inactive

**Test Case:** [CrewConflictResolutionTests.cs](../Tests/Integration/CrewConflictResolutionTests.cs) (to create)

---

### CrewCertificate

| Aspect | Value | Notes |
|--------|-------|-------|
| **Owner** | 🏢 SHORE | HR/Compliance manages validity |
| **Sync Direction** | ← | Shore → Edge (one-way) |
| **Edge Permissions** | VALIDATE ONLY | Check expiry, alert if near expiration |
| **Conflict Rule** | SHORE ONLY | Certification authority is shore |
| **Related** | CrewMember (1:N) |

**Use Case:**
- Shore renews STCW certificate for crew
- Edge pulls new cert, updates IsValid flag
- Edge alerts Master if cert expires < 30 days

---

### CrewOnboardEvent (Sign-On/Off Records)

| Aspect | Value | Notes |
|--------|-------|-------|
| **Owner** | ⛴️ EDGE | Real onboarding happens on ship |
| **Sync Direction** | → | Edge → Shore (one-way) |
| **Update Path** | Edge creates SignOnRecord → Shore receives → KPI calcs |
| **Conflict Rule** | EDGE DEFINITIVE | Actual onboarding = edge event |

**Sync Actions:**
- CREATE: Edge crew signs on → Shore records (read-only)
- Cannot UPDATE/DELETE (immutable compliance log)

---

## 3️⃣ DOCUMENTATION (Share-to-Edge Delivery)

### TravelDocument, SeafarerDocument, EmploymentDocument, HealthDocument

| Aspect | Value | Notes |
|--------|-------|-------|
| **Owner** | 🏢 SHORE | Compliance repository |
| **Sync Direction** | ← | Shore → Edge (one-way) |
| **Files Included?** | ✅ YES (with metadata-first) | Passports, certs, medical records |
| **EdgePermissions** | VIEW ONLY | Display, verify expiry dates |
| **Conflict Rule** | SHORE ONLY | Source of truth |
| **File Transfer** | Chunked, resume-capable, checksum validation |

**Sync Actions:**
- CREATE: Shore uploads crew doc → Edge receives file
- UPDATE: Shore uploads new version → Edge receives (full replace)
- DELETE: Shore archives doc → Edge marks archived

**Test Case:** Already in [FileSyncTests.cs](../Tests/Integration/FileSyncTests.cs)

---

## 4️⃣ MASTER DATA (One-Way Shore → Edge)

### Certificate, Country, Rank, RankCertificate, CountryCertificate

| Aspect | Value | Notes |
|--------|-------|-------|
| **Owner** | 🏢 SHORE | Global reference data |
| **Sync Direction** | ← | Shore → Edge (one-way) |
| **Edge Permissions** | READ ONLY | Lookup, validation |
| **Conflict Rule** | SHORE ONLY | No conflicts, immutable |
| **Frequency** | On demand + bulk sync | During initialization or batch updates |

---

## 5️⃣ CONFLICT RESOLUTION - DETAILED ALGORITHM

### Priority Order (when conflict detected)

```
1. Check which system is OWNER of the field
   → Owner value wins (apply it)
   → Non-owner rejects incoming change
   
2. If both compete for ownership
   → LOG as CRITICAL conflict
   → SHORE WINS by default (business logic)
   → NOTIFY Edge of decision
   
3. If timestamps differ
   → NEWER timestamp usually wins (for operational data)
   → OLDER timestamp wins (for HR data—prevent rollback)
   
4. If data is IMMUTABLE
   → Reject any modification
   → Version mismatch = error
```

### Concrete Example: CrewMember FullName

```
Scenario: 
  Shore: Crew → rename from "John Smith" to "John David Smith" (HR update)
  Edge: Crew → changes own name to "John Dave Smith" (local input)
  
Conflict Detection:
  FullName is in SHORE_OWNED_FIELDS
  → Shore version "John David Smith" APPLIES
  → Edge version REJECTED with reason "Field is Shore-authoritative"
  
Notification:
  Edge receives: 
  {
    "conflictResolved": true,
    "field": "FullName",
    "decisionedBy": "SHORE",
    "reason": "Field is Shore-authoritative",
    "acceptedValue": "John David Smith",
    "rejectedValue": "John Dave Smith",
    "action": "APPLY"
  }
```

---

## 6️⃣ SOFT DELETE POLICY

| Entity | Soft Delete? | Archive? | Sync Delete? |
|--------|-------------|----------|------------|
| VoyageRecord | ✅ YES | ✅ Archive | ✅ Soft delete synced |
| CrewMember | ✅ YES | ✅ Archive | ✅ Soft delete synced |
| CrewCertificate | ✅ YES | ✅ Archive | ✅ Soft delete synced |
| Document | ✅ YES | ✅ Archive | ✅ Soft delete synced |
| ExternalRequest | ✅ YES | ✅ Archive | ❌ Do not sync delete |

**Rationale:** Compliance audit trail—never hard-delete operational data.

---

## 7️⃣ IDEMPOTENCY & REPLAY

### Problem
- Network failures cause duplicate syncs
- Edge sends same voyage update twice → Shore receives twice
- Solution: Idempotency keys

### Implementation

**Edge sends:**
```json
{
  "tableNName": "voyage_record",
  "recordKey": "voyage-123",
  "syncVersion": 42,  // Uniquely identifies this change
  "action": "UPDATE",
  "payload": {...}
}
```

**Shore's `SyncInboxService` checks:**
```csharp
var alreadyProcessed = await db.SyncLog
  .Where(s => s.TableName == item.TableName  
          && s.RecordKey == item.RecordKey
          && s.SyncVersion == item.SyncVersion)  // ← Idempotency key
  .FirstOrDefaultAsync();
  
if (alreadyProcessed != null)
  return SUCCESS; // Same request, skip processing
```

**Similarly, Edge's `SyncConflictHandler` checks:**
```csharp
var alreadyApplied = await context.SyncLog
  .Where(s => s.OriginNode == "SHORE"
          && s.TableName == item.TableName
          && s.RecordKey == item.RecordKey
          && s.SyncVersion == item.SyncVersion)
  .FirstOrDefaultAsync();
```

---

## 8️⃣ NOTIFICATION ON CONFLICT

When a conflict is resolved:

**Shore → Edge:**
```json
{
  "type": "sync_conflict_resolved",
  "severity": "warning",
  "entity": "CrewMember",
  "conflictedFields": ["FullName"],
  "resolution": "SHORE_WON",
  "message": "Crew name was updated by HR: John David Smith"
}
```

**Edge logs to SystemLog:**
```
Category: SYNC
Action: CONFLICT_RESOLVED
Message: CrewMember#123 FullName: rejected 'John Dave Smith', applied 'John David Smith'
Level: WARNING
```

---

## 9️⃣ SYNC COMPLETENESS CHECKLIST

- [ ] **All tables** have explicit ownership defined
- [ ] **All fields** classified as Shore/Edge/Immutable
- [ ] **Conflict rules** documented for each table
- [ ] **Test cases** created for each sync direction
- [ ] **Edge implements** ConflictHandler for all tables
- [ ] **Shore emits** SyncOutbox for all changes
- [ ] **Notifications** sent on all conflicts
- [ ] **Audit trail** captures all sync decisions
- [ ] **Soft delete** policy enforced everywhere
- [ ] **Network failures** handled (idempotency, retry)

---

## 🔟 DEPLOYMENT CHECKLIST

Before going PROD with Shore → Edge sync:

1. ✅ Unit tests for all ownership rules
2. ✅ E2E tests for each conflict scenario  
3. ✅ Load test (100 concurrent sync ops)
4. ✅ Network failure test (packet loss, timeouts)
5. ✅ Real data migration test (production-like dataset)
6. ✅ Crew accessibility testing (field updates work as expected)
7. ✅ Notification validation (crew sees conflict alerts)
8. ✅ Audit log verification (all syncs logged)
9. ✅ Rollback plan (revert to one-way if issues)
10. ✅ Monitoring setup (sync latency, conflict rates, failure rates)

---

## References

- [VoyageSyncE2ETests.cs](../Tests/Integration/VoyageSyncE2ETests.cs) — Test implementation
- [SyncConflictHandler.cs](../Services/Core/SyncConflictHandler.cs) — Edge conflict resolution
- [SyncInboxService.cs](../Services/Sync/SyncInboxService.cs) — Shore sync intake
- [SyncOutboxService.cs](../Services/Sync/SyncOutboxService.cs) — Shore sync delivery
- [ShoreAutoSyncInterceptor.cs](../Services/Sync/ShoreAutoSyncInterceptor.cs) — Auto-discovery mechanism
