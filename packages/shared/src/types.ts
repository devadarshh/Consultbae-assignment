/** Canonical normalized source record that entity resolution operates on. */
export interface SourceRecord {
  id: number; // index within the whole ingestion batch
  source: string; // 'naukri' | 'gig' | 'cbnexus'
  sourceRow: number; // 1-based row number in the original file (excluding header)
  name: string; // normalized display name
  email: string | null; // normalized
  phone: string | null; // normalized
  city: string | null; // normalized
  skills: string[]; // normalized
  experienceYears: number | null;
  ctc: number | null;
  ctcMalformed: boolean;
  appliedDateIso: string | null;
  dateAmbiguous: boolean;
  rate: { amount: number; unit: string } | null;
  status: string | null;
  verified: boolean | null;
  projectsCompleted: number | null;
  rawData: Record<string, unknown>; // full verbatim row
  matchedBy: string; // 'unique' | 'email' | 'phone' | 'name_city'
}

/** Issues detected while cleaning a source file. */
export interface CleanIssue {
  row: number; // 1-based row number in the original file
  type: string;
  detail: string;
  resolved: boolean;
}

export interface CleanedSource {
  source: string;
  records: SourceRecord[];
  issues: CleanIssue[];
}

export interface PersonGroup {
  records: SourceRecord[];
  canonicalName: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  experienceYears: number | null;
  ctc: number | null;
  ctcMalformed: boolean;
  matchedBySet: Set<string>;
}

export interface MergeDecision {
  fromRecordId: number;
  intoPersonId: number; // group index
  by: 'email' | 'phone' | 'name_city';
  note: string;
}

export interface RejectedMatch {
  recordAId: number;
  recordBId: number;
  reason: string;
}

export interface ResolutionResult {
  people: PersonGroup[];
  decisions: MergeDecision[];
  rejected: RejectedMatch[];
}