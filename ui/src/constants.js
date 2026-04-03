export const STATUS_LABELS = {
  unopened: "Unopened",
  in_planning: "In Planning",
  in_execution: "In Execution",
  ready_for_human_review: "Ready For Human Review",
  human_reviewed_and_closed: "Human Reviewed and Closed",
  closed_without_human_review: "Closed without Human Review",
};

export const STATUS_ORDER = [
  "unopened",
  "in_planning",
  "in_execution",
  "ready_for_human_review",
  "human_reviewed_and_closed",
  "closed_without_human_review",
];

export const STATUS_TONES = {
  unopened: "neutral",
  in_planning: "purple",
  in_execution: "blue",
  ready_for_human_review: "amber",
  human_reviewed_and_closed: "green",
  closed_without_human_review: "slate",
};
