import {
  getNextReminderAtFromCadence,
  type ReminderFrequencyUnitValue,
} from "@/lib/whatsapp";

export type { ReminderFrequencyUnitValue };
export type ReminderStatusValue = "NOT_SCHEDULED" | "ACTIVE" | "PAUSED";

export type ReminderSchedule = {
  reminderFrequencyValue: number;
  reminderFrequencyUnit: ReminderFrequencyUnitValue;
  reminderStatus: "ACTIVE";
  nextReminderAt: Date;
  lastReminderAt: null;
};

type ReminderStatusSummaryInput = {
  reminderFrequencyValue?: number | null;
  reminderFrequencyUnit?: ReminderFrequencyUnitValue | null;
  reminderStatus?: ReminderStatusValue | null;
  nextReminderAt?: Date | null;
};

const HOUR_MIN = 1;
const HOUR_MAX = 24;
const DAY_MIN = 1;
const DAY_MAX = 30;

const reminderDateFormatter = new Intl.DateTimeFormat("en-MY", {
  timeZone: "Asia/Kuala_Lumpur",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
});

export function parseReminderScheduleFromFormData(
  formData: FormData,
  now = new Date()
): ReminderSchedule {
  const reminderFrequencyValue = parseReminderFrequencyValue(
    formData.get("reminderFrequencyValue")
  );
  const reminderFrequencyUnit = parseReminderFrequencyUnit(
    formData.get("reminderFrequencyUnit")
  );

  assertReminderFrequencyInRange(reminderFrequencyValue, reminderFrequencyUnit);

  return {
    reminderFrequencyValue,
    reminderFrequencyUnit,
    reminderStatus: "ACTIVE",
    nextReminderAt: getNextReminderAtFromCadence(
      reminderFrequencyValue,
      reminderFrequencyUnit,
      now
    ),
    lastReminderAt: null,
  };
}

export function getReminderStatusLabel(input: ReminderStatusSummaryInput) {
  if (
    input.reminderStatus !== "ACTIVE" ||
    !input.reminderFrequencyValue ||
    !input.reminderFrequencyUnit ||
    !input.nextReminderAt
  ) {
    if (
      input.reminderStatus === "PAUSED" &&
      input.reminderFrequencyValue &&
      input.reminderFrequencyUnit
    ) {
      return `${getCadenceLabel(
        input.reminderFrequencyValue,
        input.reminderFrequencyUnit
      )} - paused`;
    }

    return "Not scheduled";
  }

  return `${getCadenceLabel(
    input.reminderFrequencyValue,
    input.reminderFrequencyUnit
  )} - next ${reminderDateFormatter.format(input.nextReminderAt)}`;
}

function parseReminderFrequencyValue(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    throw new Error("Please choose a reminder frequency.");
  }

  const parsed = Number(value.trim());
  if (!Number.isInteger(parsed)) {
    throw new Error("Please choose a valid reminder frequency.");
  }

  return parsed;
}

function parseReminderFrequencyUnit(
  value: FormDataEntryValue | null
): ReminderFrequencyUnitValue {
  if (value === "HOURS" || value === "DAYS") return value;
  throw new Error("Please choose hours or days for the reminder.");
}

function assertReminderFrequencyInRange(
  value: number,
  unit: ReminderFrequencyUnitValue
) {
  const min = unit === "HOURS" ? HOUR_MIN : DAY_MIN;
  const max = unit === "HOURS" ? HOUR_MAX : DAY_MAX;

  if (value < min || value > max) {
    throw new Error(
      unit === "HOURS"
        ? "Reminder hours must be between 1 and 24."
        : "Reminder days must be between 1 and 30."
    );
  }
}

function getCadenceLabel(value: number, unit: ReminderFrequencyUnitValue) {
  const unitLabel =
    unit === "HOURS"
      ? value === 1
        ? "hour"
        : "hours"
      : value === 1
        ? "day"
        : "days";

  return `Every ${value} ${unitLabel}`;
}
