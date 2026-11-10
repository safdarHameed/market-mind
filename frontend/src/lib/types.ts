export type LocationLevel = "global" | "country" | "region" | "city";

export interface Location {
  level: LocationLevel;
  label: string;
  country?: string | null;
  country_code?: string | null;
  region?: string | null;
  city?: string | null;
}

export type DiscoveryType = "business_opportunities" | "unsolved_problems" | "market_gaps" | "emerging_trends";
export type Confidence = "low" | "moderate" | "high";
export type Status = "queued" | "running" | "completed" | "failed";

export interface Filters {
  time_period: "7d" | "30d" | "3m" | "6m" | "1y" | "any";
  stage?: string;
  competition?: string;
  investment?: string;
  scale?: string;
  audience?: string;
}

export interface DiscoveryRequest {
  location: Location;
  industries: string[];
  custom_topic?: string | null;
  discovery_type: DiscoveryType;
  query?: string | null;
  filters: Filters;
}

export interface ProgressEvent {
  stage: string;
  label: string;
  status: "active" | "done" | "error";
  message: string;
  at: string;
}

export interface OpportunityCard {
  id: string;
  discovery_id: string;
  title: string;
  summary: string;
  industry: string;
  location_label: string;
  geographic_precision: LocationLevel;
  score: number | null;
  confidence: Confidence | null;
  evidence_strength: "limited" | "moderate" | "strong";
  independent_source_count: number;
  supporting_count: number;
  contradicting_count: number;
  growth_direction: "rising" | "stable" | "declining" | null;
  is_demo: boolean;
  created_at: string;
}

export interface DiscoveryStats {
  queries?: number;
  results_returned?: number;
  unique_urls?: number;
  verified?: number;
  snippet_only?: number;
  unreachable?: number;
  duplicates?: number;
  analyzed?: number;
  independent_publishers?: number;
  findings?: number;
  signals?: number;
  opportunities?: number;
  failed_queries?: number;
  note?: string;
}

export interface OpportunityAnswer extends OpportunityCard {
  plain_summary: string | null;
  who: string | null;
  main_risk: string | null;
  top_evidence: { claim: string; domain: string; url: string; title: string; is_sample: boolean }[];
}

export interface DiscoverySummary {
  id: string;
  title: string;
  status: Status;
  stage: string | null;
  discovery_type: DiscoveryType;
  discovery_type_label: string;
  location: Location;
  industries: string[];
  custom_topic: string | null;
  query: string | null;
  is_demo: boolean;
  created_at: string;
  completed_at: string | null;
  opportunity_count: number;
  error: string | null;
}

export interface DiscoveryDetail extends DiscoverySummary {
  filters: Filters;
  progress: ProgressEvent[];
  stats: DiscoveryStats;
  query_plan: { interpretation: string; geographic_note: string; queries: { query: string; purpose: string; angle: string }[] } | null;
  search_provider: string | null;
  llm_model: string | null;
  started_at: string | null;
  opportunities: OpportunityAnswer[];
}

export type VerificationStatus = "verified" | "snippet_only" | "unreachable" | "pending" | "sample";

export interface Source {
  id: string;
  ref?: string;
  url: string;
  title: string;
  publisher: string | null;
  domain: string;
  published_at: string | null;
  published_at_source: string | null;
  retrieved_at: string | null;
  source_type: string;
  origin: "discovery" | "debate" | "recheck";
  verification_status: VerificationStatus;
  verification_note: string | null;
  duplicate_of_id: string | null;
  duplicate_reason: string | null;
  search_query: string | null;
  excerpt: string | null;
}

export type Stance = "supporting" | "contradicting" | "competitor" | "context";

export interface Evidence {
  id: string;
  stance: Stance;
  origin: "report" | "debate" | "recheck";
  claim_supported: string;
  relevance: string;
  finding: {
    id: string;
    statement: string;
    quote: string | null;
    quote_verified: boolean;
    finding_type: string;
    claim_kind: string;
    geographic_scope: string | null;
  } | null;
  source: Source;
  created_at: string;
}

export interface GroundedPoint {
  point: string;
  finding_ids: string[];
  source_ids: string[];
}

export interface ScoreDimension {
  key: string;
  label: string;
  weight: number;
  description: string;
  score: number | null;
  rationale: string | null;
}

export interface ScoreDetail {
  version: number;
  overall: number;
  raw_overall: number;
  confidence: Confidence;
  confidence_rationale: string;
  explanation: string;
  limitations: string[];
  cap_reason: string | null;
  reason: "initial" | "reassessment";
  change_summary: string | null;
  created_at: string;
  dimensions: ScoreDimension[];
}

export interface Solution {
  kind: string;
  name: string;
  what_it_does: string;
  who_uses_it: string;
  value_proposition: string;
  revenue_model: string;
  mvp: string;
}

export interface OpportunityReport extends OpportunityCard {
  plain_summary: string | null;
  geographic_note: string | null;
  problem: { what: string; who: string; why_it_matters: string; frequency?: string | null };
  target_audience: { segment: string; why: string }[];
  evidence_connections: GroundedPoint[];
  why_now: GroundedPoint[];
  existing_alternatives: { name: string; description: string; source_ids: string[] }[];
  competition_note: string | null;
  solutions: Solution[];
  risks: { risk: string; severity: "low" | "medium" | "high"; source_ids: string[] }[];
  unknowns: { unknown: string; how_to_validate: string }[];
  validation_steps: string[];
  claim_breakdown: {
    observed_facts: GroundedPoint[];
    source_claims: GroundedPoint[];
    ai_interpretations: string[];
    estimates: string[];
    hypotheses: string[];
  };
  signals: { id: string; title: string; description: string; independent_source_count: number }[];
  evidence: Evidence[];
  sources: (Source & { ref: string })[];
  score_detail: ScoreDetail | null;
  score_history: { version: number; overall: number; confidence: Confidence; reason: string; created_at: string; change_summary: string | null }[];
  discovery: {
    id?: string;
    title: string;
    location?: Location;
    discovery_type?: DiscoveryType;
    industries?: string[];
    created_at: string;
    completed_at?: string | null;
    stats: DiscoveryStats;
    search_provider: string | null;
    is_demo: boolean;
  };
  is_saved?: boolean;
  is_watched?: boolean;
  share_token?: string | null;
  siblings?: OpportunityCard[];
}

export interface Citation {
  ref: string;
  source_id: string;
  is_new: boolean;
}

export type ChatMode = "explain" | "challenge" | "investigate" | "build";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  mode: ChatMode | null;
  content: string;
  citations: Citation[];
  research_queries: string[];
  status: "complete" | "error";
  created_at: string;
}

export interface Conversation {
  id: string;
  opportunity_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
  messages?: ChatMessage[];
}

export interface AppConfig {
  llm_configured: boolean;
  llm_provider: string | null;
  llm_model: string | null;
  llm_source: "user" | "server" | null;
  search_provider: string | null;
  search_provider_label: string | null;
  research_ready: boolean;
  limits: { max_sources: number; max_queries: number; respect_robots_txt: boolean };
}

export interface Me {
  id: string;
  display_name: string | null;
  home_country: string | null;
  created_at: string;
  is_guest: boolean;
  counts: { discoveries: number; saved: number; watchlist: number; conversations: number };
}

export interface ProviderInfo {
  id: string;
  label: string;
  key_url: string | null;
  key_placeholder: string;
  needs_base_url: boolean;
  suggested: string[];
  web_search: boolean;
}

export interface AISettings {
  providers: ProviderInfo[];
  search_providers: { id: string; label: string }[];
  saved: {
    provider: string | null;
    model: string | null;
    base_url: string | null;
    has_key: boolean;
    key_hint: string | null;
    search_provider: string;
    has_search_key: boolean;
    search_key_hint: string | null;
  };
  active: {
    ai: { provider: string; label: string; model: string; source: "user" | "server" } | null;
    search: { provider: string; label: string; source: "user" | "server" } | null;
    ready: boolean;
  };
}
