export type ExperienceLevel =
  | "beginner"
  | "developer_learning_ai"
  | "practitioner"
  | "ml_engineer";

export type DigestLens = "builder" | "founder" | "researcher";

export type Config = {
  profile_description: string;
  experience_level: ExperienceLevel;
  digest_lens?: DigestLens;
  topics: string[];
  digest_hour: number;
  timezone_offset: number;
  active?: boolean;
  notion_connected: boolean;
  notion_database_id: string | null;
  email_digest_enabled?: boolean;
  delivery_email?: string | null;
  webhook_url?: string | null;
  webhook_platform?: "slack" | "discord" | "generic";
};

export type UserProfile = {
  email: string | null;
  name: string | null;
  tier: "free" | "pro";
  authMethod: "clerk" | "notion";
};

export type FeedbackStats = {
  total: number;
  more: number;
  less: number;
};

export type Toast = { message: string; type: "success" | "error" };

export type Tab = "intelligence" | "schedule" | "channels" | "account";

export const DIGEST_LENSES: { value: DigestLens; label: string; sub: string; icon: string }[] = [
  { value: "builder", label: "Builder", sub: "Practical code, architectures & implementation takeaways", icon: "🛠️" },
  { value: "founder", label: "Founder", sub: "Market signals, consumer pain points & product opportunities", icon: "💡" },
  { value: "researcher", label: "Researcher", sub: "Deep-tech, theoretical novelty, mathematical rigor & claims", icon: "🔬" },
];

export const EXPERIENCE_LEVELS: { value: ExperienceLevel; label: string; sub: string }[] = [
  { value: "beginner", label: "Complete beginner", sub: "Just starting with AI" },
  { value: "developer_learning_ai", label: "Developer learning AI", sub: "Know how to code, learning ML" },
  { value: "practitioner", label: "Practitioner", sub: "Building AI systems regularly" },
  { value: "ml_engineer", label: "ML Engineer", sub: "Training models, deep ML work" },
];

export const SUGGESTED_TOPICS = [
  "RAG and retrieval systems",
  "AI agents and automation",
  "LLM application development",
  "Fine-tuning and RLHF",
  "Multimodal AI",
  "AI safety and alignment",
  "Embeddings and vector search",
  "Evaluation and benchmarking",
];

export function formatHour(h: number): string {
  if (h === 0) return "12:00 AM";
  if (h < 12) return `${h}:00 AM`;
  if (h === 12) return "12:00 PM";
  return `${h - 12}:00 PM`;
}
