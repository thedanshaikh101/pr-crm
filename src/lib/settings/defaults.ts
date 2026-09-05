// Defaults seeded on first visit when an account has no rows of a kind.
export const PICKLIST_KINDS = ["case_type", "topic_type"] as const;
export type PickListKind = (typeof PICKLIST_KINDS)[number];

export const PICKLIST_DEFAULTS: Record<PickListKind, string[]> = {
  case_type: ["Media enquiry", "Interview request", "Statement request", "Correction", "Complaint", "FOI"],
  topic_type: ["Announcement", "Crisis", "Campaign", "Issue", "Event", "Ongoing"],
};

export const PICKLIST_LABELS: Record<PickListKind, string> = { case_type: "Case Types", topic_type: "Topic Types" };
