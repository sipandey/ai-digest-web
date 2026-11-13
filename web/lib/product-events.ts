export type ProductEvent =
  | "onboarding_completed"
  | "digest_opened"
  | "paper_expanded"
  | "paper_saved"
  | "paper_feedback"
  | "schedule_paused";

/** Records an allowlisted event name only; never send profile or paper content. */
export function recordProductEvent(event: ProductEvent): void {
  void fetch("/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event }),
    keepalive: true,
  }).catch(() => undefined);
}
