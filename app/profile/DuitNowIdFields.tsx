"use client";

import { useState } from "react";
import {
  DUITNOW_ID_TYPES,
  getDuitNowIdPlaceholder,
  isDuitNowIdType,
  type DuitNowIdTypeValue,
} from "@/lib/duitnow";

type DuitNowIdFieldsProps = {
  defaultType: string | null;
  defaultValue: string | null;
};

export default function DuitNowIdFields({
  defaultType,
  defaultValue,
}: DuitNowIdFieldsProps) {
  const defaultTypeValue = defaultType ?? "";
  const initialType = isDuitNowIdType(defaultTypeValue) ? defaultTypeValue : "";
  const [idType, setIdType] = useState<DuitNowIdTypeValue | "">(initialType);

  return (
    <>
      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium">DuitNow ID type</span>
        <select
          name="duitNowIdType"
          value={idType}
          onChange={(event) => {
            const value = event.target.value;
            setIdType(isDuitNowIdType(value) ? value : "");
          }}
          required
          className="h-11 rounded-lg border border-[#e5e7eb] bg-white px-4 text-base outline-none focus:border-2 focus:border-[#1d4ed8]"
        >
          <option value="" disabled>
            Select type
          </option>
          {DUITNOW_ID_TYPES.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium">DuitNow ID value</span>
        <input
          name="duitNowIdValue"
          defaultValue={defaultValue ?? ""}
          required
          placeholder={getDuitNowIdPlaceholder(idType)}
          className="h-11 rounded-lg border border-[#e5e7eb] bg-white px-4 text-base outline-none placeholder:text-[#8e8e93] focus:border-2 focus:border-[#1d4ed8]"
        />
      </label>
    </>
  );
}
