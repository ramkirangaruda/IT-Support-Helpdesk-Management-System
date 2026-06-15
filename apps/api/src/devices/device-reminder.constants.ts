export const DEVICE_QUEUE_NAME = 'devices';

export const DeviceJobType = {
  CHECK_DEVICE_LIMITS: 'CHECK_DEVICE_LIMITS',
} as const;

export type DeviceJobType = (typeof DeviceJobType)[keyof typeof DeviceJobType];

/** Cron: weekdays at 09:00 */
export const DEVICE_REMINDER_CRON = '0 9 * * 1-5';
