export const SLA_QUEUE_NAME = 'sla';

export const SlaJobType = {
  CHECK_SLA_WARNINGS:  'CHECK_SLA_WARNINGS',
  CHECK_ESCALATIONS:   'CHECK_ESCALATIONS',
} as const;

export type SlaJobType = (typeof SlaJobType)[keyof typeof SlaJobType];

/** Repeat interval for both SLA jobs (ms) */
export const SLA_CHECK_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
