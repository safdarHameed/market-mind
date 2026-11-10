import type { DiscoveryType, Filters } from "./types";

export const INDUSTRIES = [
  "Artificial Intelligence",
  "Technology & Software",
  "E-commerce & Retail",
  "Finance & Fintech",
  "Agriculture & Farming",
  "Healthcare & Wellness",
  "Education",
  "Manufacturing",
  "Logistics & Transportation",
  "Energy & Sustainability",
  "Real Estate & Construction",
  "Food & Restaurants",
  "Travel & Hospitality",
  "Fashion & Lifestyle",
  "Cybersecurity",
  "Automotive & Mobility",
  "Consumer Products",
  "Media & Entertainment",
  "Professional Services",
  "Other / Emerging Industries",
] as const;

export const TOPIC_EXAMPLES = [
  "AI automation for small businesses",
  "Sustainable packaging",
  "Agricultural logistics",
  "Digital payments for local retailers",
];

export const QUERY_EXAMPLES = [
  "What problems are small retailers facing?",
  "Find underserved markets in agriculture",
  "What products are people struggling to find?",
  "Discover emerging AI opportunities in Europe",
];

export const DISCOVERY_TYPES: { value: DiscoveryType; label: string; description: string }[] = [
  { value: "business_opportunities", label: "Business Opportunities", description: "Things you could build or sell, backed by real demand." },
  { value: "unsolved_problems", label: "Unsolved Problems", description: "Problems people keep having that nobody solves well." },
  { value: "market_gaps", label: "Market Gaps", description: "Needs that current products don’t meet." },
  { value: "emerging_trends", label: "Emerging Trends", description: "What’s changing and creating new chances." },
];

export const TIME_PERIODS: { value: Filters["time_period"]; label: string }[] = [
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "3m", label: "3 months" },
  { value: "6m", label: "6 months" },
  { value: "1y", label: "1 year" },
  { value: "any", label: "Any time" },
];

export const FILTER_GROUPS: { key: Exclude<keyof Filters, "time_period">; label: string; options: { value: string; label: string }[] }[] = [
  { key: "stage", label: "Opportunity stage", options: [
    { value: "early_signal", label: "Early signal" }, { value: "emerging", label: "Emerging" },
    { value: "growing", label: "Growing" }, { value: "established", label: "Established" }] },
  { key: "competition", label: "Competition", options: [
    { value: "low", label: "Low" }, { value: "moderate", label: "Moderate" }, { value: "high", label: "High" }] },
  { key: "investment", label: "Investment", options: [
    { value: "low", label: "Low" }, { value: "moderate", label: "Moderate" }, { value: "high", label: "High" }] },
  { key: "scale", label: "Business scale", options: [
    { value: "individual", label: "Individual" }, { value: "small_business", label: "Small business" },
    { value: "startup", label: "Startup" }, { value: "enterprise", label: "Enterprise" }] },
  { key: "audience", label: "Audience", options: [
    { value: "consumers", label: "Consumers" }, { value: "businesses", label: "Businesses" }, { value: "government", label: "Government" }] },
];

/** Curated prompts for "Surprise me" — each is a real research request, not a canned result. */
export const SURPRISE_TOPICS: { topic: string; industries: string[]; type: DiscoveryType }[] = [
  { topic: "Repair and refurbishment of consumer electronics", industries: ["Consumer Products"], type: "market_gaps" },
  { topic: "Cold-chain storage for small farmers", industries: ["Agriculture & Farming", "Logistics & Transportation"], type: "unsolved_problems" },
  { topic: "AI tools for accounting firms", industries: ["Artificial Intelligence", "Professional Services"], type: "business_opportunities" },
  { topic: "Elderly care at home", industries: ["Healthcare & Wellness"], type: "emerging_trends" },
  { topic: "Second-hand fashion resale", industries: ["Fashion & Lifestyle", "E-commerce & Retail"], type: "emerging_trends" },
  { topic: "Cybersecurity for small businesses", industries: ["Cybersecurity"], type: "unsolved_problems" },
  { topic: "EV charging for apartment residents", industries: ["Automotive & Mobility", "Energy & Sustainability"], type: "market_gaps" },
  { topic: "Restaurant food waste", industries: ["Food & Restaurants", "Energy & Sustainability"], type: "business_opportunities" },
  { topic: "Upskilling for workers displaced by automation", industries: ["Education"], type: "market_gaps" },
  { topic: "Last-mile delivery in dense cities", industries: ["Logistics & Transportation"], type: "unsolved_problems" },
];

export const SOURCE_TYPE_LABELS: Record<string, string> = {
  news: "News",
  government: "Government",
  research: "Research",
  forum: "Forum / community",
  reviews: "Reviews",
  press_release: "Press release",
  blog: "Blog / commentary",
  web_page: "Web page",
};

export const STAGE_ORDER = [
  "planning",
  "retrieving",
  "validating",
  "deduplicating",
  "extracting",
  "clustering",
  "generating",
] as const;

export const STAGE_LABELS: Record<string, { label: string; hint: string }> = {
  planning: { label: "Planning the search", hint: "Deciding what to look for" },
  retrieving: { label: "Searching the web", hint: "Finding news, reports and discussions" },
  validating: { label: "Reading the pages", hint: "Opening each page to check what it says" },
  deduplicating: { label: "Removing repeats", hint: "The same story twice only counts once" },
  extracting: { label: "Pulling out key facts", hint: "Noting what each source says" },
  clustering: { label: "Finding patterns", hint: "Grouping facts that point the same way" },
  generating: { label: "Writing up opportunities", hint: "Weighing what’s for and against" },
};
