import { Buffer } from "node:buffer";

type OcrSpaceResponse = {
  ParsedResults?: {
    ParsedText?: string;
  }[];
  IsErroredOnProcessing?: boolean;
  ErrorMessage?: string | string[];
  ErrorDetails?: string;
};

type ExtractImageTextOptions = {
  file: File;
  bytes: Buffer;
  fallbackFileName: string;
  failureMessage: string;
  emptyTextMessage: string;
};

export async function extractImageTextWithOcrSpace({
  file,
  bytes,
  fallbackFileName,
  failureMessage,
  emptyTextMessage,
}: ExtractImageTextOptions) {
  const apiKey = assertOcrSpaceConfigured();
  const body = new FormData();
  const imageBuffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(imageBuffer).set(bytes);
  body.append(
    "file",
    new Blob([imageBuffer], { type: file.type }),
    file.name || fallbackFileName
  );
  body.append("language", "eng");
  body.append("isOverlayRequired", "false");
  body.append("detectOrientation", "true");
  body.append("OCREngine", "2");

  const response = await fetch("https://api.ocr.space/parse/image", {
    method: "POST",
    headers: {
      apikey: apiKey,
    },
    body,
  });

  const result = (await response.json().catch(() => null)) as OcrSpaceResponse | null;
  if (!response.ok || !result) {
    throw new Error(failureMessage);
  }

  if (result.IsErroredOnProcessing) {
    throw new Error(getOcrErrorMessage(result, failureMessage));
  }

  const text = result.ParsedResults?.map((parsed) => parsed.ParsedText ?? "")
    .join("\n")
    .trim();

  if (!text) {
    throw new Error(emptyTextMessage);
  }

  return text;
}

function assertOcrSpaceConfigured() {
  const apiKey = process.env.OCR_SPACE_API_KEY;

  if (!apiKey) {
    throw new Error("Missing OCR_SPACE_API_KEY in .env.");
  }

  return apiKey;
}

function getOcrErrorMessage(result: OcrSpaceResponse, fallbackMessage: string) {
  const message = Array.isArray(result.ErrorMessage)
    ? result.ErrorMessage.filter(Boolean).join(" ")
    : result.ErrorMessage;

  return message || result.ErrorDetails || fallbackMessage;
}
