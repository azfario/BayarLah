"use client";

import { useActionState, useRef } from "react";
import { parseDuitNowRecipientName } from "@/lib/actions/profile";
import type { ParseDuitNowNameState } from "@/lib/actions/profile";

type DuitNowQrFieldProps = {
  defaultName: string;
  defaultQrUrl: string | null;
};

const initialState: ParseDuitNowNameState = {};

export default function DuitNowQrField({
  defaultName,
  defaultQrUrl,
}: DuitNowQrFieldProps) {
  const nameRef = useRef<HTMLInputElement>(null);
  const [parseState, parseAction, isParsing] = useActionState(
    async (prev: ParseDuitNowNameState, formData: FormData) => {
      const result = await parseDuitNowRecipientName(prev, formData);
      if (result.name && nameRef.current) {
        nameRef.current.value = result.name;
      }
      return result;
    },
    initialState
  );

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("duitNowQr", file);
    void parseAction(formData);
  }

  return (
    <>
      <div className="flex min-w-0 flex-col gap-5">
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium">DuitNow recipient name</span>
          <input
            ref={nameRef}
            name="duitNowRecipientName"
            defaultValue={defaultName}
            required
            placeholder="Name shown on bank receipts"
            className="h-11 rounded-lg border border-[#e5e7eb] bg-white px-4 text-base outline-none placeholder:text-[#8e8e93] focus:border-2 focus:border-[#1d4ed8]"
          />
          <span className="text-sm leading-5 text-[#5f5f5f]">
            {isParsing
              ? "Reading name from QR…"
              : parseState.error
                ? parseState.error
                : "Upload your QR below and we'll fill this in automatically."}
          </span>
        </label>

        <div>
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium">DuitNow QR image</span>
            <input
              name="duitNowQr"
              type="file"
              accept="image/*"
              required={!defaultQrUrl}
              onChange={handleFileChange}
              className="block min-h-11 cursor-pointer rounded-lg border border-[#e5e7eb] bg-white text-sm text-[#5f5f5f] file:mr-3 file:min-h-11 file:cursor-pointer file:rounded-full file:border-0 file:bg-[#0a0a0a] file:px-5 file:text-sm file:font-semibold file:text-white"
            />
          </label>
          <p className="mt-2 text-sm leading-5 text-[#5f5f5f]">
            Upload a clear image of your QR. A new image will replace the one
            currently saved.
          </p>
        </div>
      </div>

      {defaultQrUrl ? (
        <div className="flex items-center gap-4 rounded-xl bg-[#f7f8fa] p-3 sm:w-36 sm:flex-col sm:items-start">
          {/* User-upload hosts vary by environment, so render the stored URL directly. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={defaultQrUrl}
            alt="Current DuitNow QR"
            className="h-20 w-20 shrink-0 rounded-lg border border-[#e5e7eb] bg-white object-cover sm:h-28 sm:w-28"
          />
          <div>
            <p className="text-sm font-semibold">Current QR</p>
            <p className="mt-1 text-xs leading-4 text-[#5f5f5f]">
              Saved and ready to use
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}
