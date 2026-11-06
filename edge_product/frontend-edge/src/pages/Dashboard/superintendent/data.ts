export const inspectionRows = [
  {
    key: "internal",
    recent: 18,
    overdue: 2,
    findings: 7,
    overdueFindings: 0,
    never: 0,
    due: 3,
  },
  {
    key: "external",
    recent: 6,
    overdue: 0,
    findings: 2,
    overdueFindings: 0,
    never: 0,
    due: 1,
  },
  {
    key: "environment",
    recent: 8,
    overdue: 1,
    findings: 3,
    overdueFindings: 0,
    never: 0,
    due: 2,
  },
  {
    key: "navigation",
    recent: 12,
    overdue: 1,
    findings: 4,
    overdueFindings: 0,
    never: 0,
    due: 2,
  },
  {
    key: "flag",
    recent: 4,
    overdue: 0,
    findings: 1,
    overdueFindings: 0,
    never: 0,
    due: 1,
  },
  {
    key: "psc",
    recent: 3,
    overdue: 0,
    findings: 2,
    overdueFindings: 0,
    never: 0,
    due: 0,
  },
  {
    key: "cargo",
    recent: 9,
    overdue: 1,
    findings: 3,
    overdueFindings: 0,
    never: 1,
    due: 2,
  },
  {
    key: "cyber",
    recent: 5,
    overdue: 0,
    findings: 2,
    overdueFindings: 0,
    never: 1,
    due: 1,
  },
];
export const incidentTypes = [
  "Unsafe Act",
  "Near-Miss",
  "Accident",
  "Incident",
];
export const sampleHazards = [
  { open: 3, closed: 24 },
  { open: 2, closed: 12 },
  { open: 0, closed: 1 },
  { open: 1, closed: 5 },
];
export const sampleRiskCounts = [22, 46, 17, 7, 2];
export const sampleWorkRest = [
  { month: "01", hours: 6.2, violations: 1.2 },
  { month: "02", hours: 5.9, violations: 0.8 },
  { month: "03", hours: 6.5, violations: 0.6 },
  { month: "04", hours: 6.3, violations: 1.1 },
  { month: "05", hours: 6.8, violations: 0.5 },
  { month: "06", hours: 6.4, violations: 0.4 },
];

// Coastal passage terminating at the displayed vessel position.
export const sampleVesselTrack: [number, number][] = [
  [16.2, 108.6],
  [15.5, 109.0],
  [14.5, 109.6],
  [13.3, 109.9],
  [12.2, 109.7],
  [11.4, 109.1],
  [10.8, 108.6],
  [10.4, 108.0],
  [10.15, 107.45],
];

export const sampleComplianceFeed = [
  { reference: "SMS-2026-041", date: "06/11/2026" },
  { reference: "ENV-2026-018", date: "05/11/2026" },
  { reference: "HSE-2026-027", date: "04/11/2026" },
  { reference: "TRN-2026-012", date: "03/11/2026" },
  { reference: "NAV-2026-033", date: "02/11/2026" },
  { reference: "PMS-2026-024", date: "01/11/2026" },
  { reference: "SEC-2026-009", date: "30/10/2026" },
  { reference: "OPS-2026-016", date: "29/10/2026" },
  { reference: "CREW-2026-021", date: "28/10/2026" },
  { reference: "AUD-2026-014", date: "27/10/2026" },
];
