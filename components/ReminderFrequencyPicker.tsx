"use client";

import { useMemo, useState } from "react";

type ReminderUnit = "HOURS" | "DAYS";

type ReminderFrequencyPickerProps = {
  defaultValue?: number;
  defaultUnit?: ReminderUnit;
  className?: string;
};

const HOURS = Array.from({ length: 24 }, (_, index) => index + 1);
const DAYS = Array.from({ length: 30 }, (_, index) => index + 1);

export default function ReminderFrequencyPicker({
  defaultValue = 3,
  defaultUnit = "DAYS",
  className = "",
}: ReminderFrequencyPickerProps) {
  const [unit, setUnit] = useState<ReminderUnit>(defaultUnit);
  const [value, setValue] = useState(() =>
    clampReminderValue(defaultValue, defaultUnit)
  );
  const values = useMemo(() => (unit === "HOURS" ? HOURS : DAYS), [unit]);

  function updateUnit(nextUnit: ReminderUnit) {
    setUnit(nextUnit);
    setValue((current) => clampReminderValue(current, nextUnit));
  }

  return (
    <fieldset
      className={`rounded-md border border-zinc-200 bg-zinc-50 p-4 ${className}`}
    >
      <legend className="px-1 text-sm font-medium">Reminder frequency</legend>
      <input type="hidden" name="reminderFrequencyValue" value={value} />
      <input type="hidden" name="reminderFrequencyUnit" value={unit} />

      <div className="mt-3 grid gap-3 md:grid-cols-[1fr_160px]">
        <div className="rounded-[2rem] border border-zinc-200 bg-white p-2 shadow-inner">
          <div className="grid h-48 grid-cols-2 overflow-hidden rounded-[1.5rem] bg-zinc-50">
            <div className="snap-y snap-mandatory overflow-y-auto py-16 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {values.map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={value === option}
                  onClick={() => setValue(option)}
                  className={`flex h-10 w-full snap-center items-center justify-center text-lg font-semibold transition ${
                    value === option
                      ? "bg-white text-emerald-700 shadow-sm"
                      : "text-zinc-500 hover:bg-white hover:text-zinc-950"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>

            <div className="snap-y snap-mandatory overflow-y-auto py-14 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {(["HOURS", "DAYS"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={unit === option}
                  onClick={() => updateUnit(option)}
                  className={`flex h-12 w-full snap-center items-center justify-center text-sm font-semibold transition ${
                    unit === option
                      ? "bg-white text-emerald-700 shadow-sm"
                      : "text-zinc-500 hover:bg-white hover:text-zinc-950"
                  }`}
                >
                  {option === "HOURS" ? "hours" : "days"}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col justify-center rounded-md border border-emerald-100 bg-white px-4 py-3">
          <span className="text-xs font-medium uppercase text-zinc-500">
            Every
          </span>
          <span className="mt-1 text-2xl font-bold text-emerald-700">
            {value} {unit === "HOURS" ? unitLabel(value, "hour") : unitLabel(value, "day")}
          </span>
          <span className="mt-2 text-xs text-zinc-500">
            Starts after this expense is saved.
          </span>
        </div>
      </div>
    </fieldset>
  );
}

function clampReminderValue(value: number, unit: ReminderUnit) {
  const max = unit === "HOURS" ? 24 : 30;
  const rounded = Number.isFinite(value) ? Math.round(value) : 1;
  return Math.min(max, Math.max(1, rounded));
}

function unitLabel(value: number, unit: "hour" | "day") {
  return value === 1 ? unit : `${unit}s`;
}
