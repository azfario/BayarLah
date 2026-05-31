import { readFileSync } from "node:fs";
import { Buffer } from "node:buffer";

export type WhatsAppLinkStatusValue =
  | "NOT_LINKED"
  | "LINKING"
  | "LINKED"
  | "FAILED";

export type OpenWaSession = {
  id: string;
  name?: string | null;
  status?: string | null;
  phone?: string | null;
  phoneNumber?: string | null;
  pushName?: string | null;
  connectedAt?: string | null;
  createdAt?: string | null;
};

export type OpenWaQr = {
  code?: string | null;
  image?: string | null;
  qr?: string | null;
  qrCode?: string | null;
  qrImage?: string | null;
  qrImageDataUrl?: string | null;
};

export type OpenWaMessageResult = {
  messageId?: string | null;
  status?: string | null;
  timestamp?: string | null;
};

export type OpenWaInboundMessage = {
  id?: string | null;
  messageId?: string | null;
  _serialized?: string | null;
  from?: string | null;
  chatId?: string | null;
  type?: string | null;
  mimetype?: string | null;
  mimeType?: string | null;
  timestamp?: string | number | null;
  fromMe?: boolean | null;
  hasMedia?: boolean | null;
  mediaUrl?: string | null;
  url?: string | null;
  body?: string | null;
};

export type WhatsAppGatewaySessionStatus = {
  status: WhatsAppLinkStatusValue;
  sessionId: string | null;
  qrImageDataUrl: string | null;
  linkedPhone: string | null;
  errorMessage: string | null;
  updatedAt: string | null;
};

type OpenWaEnvelope<T> = {
  success?: boolean;
  data?: T;
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
  message?: string;
};

type RequestOpenWaOptions = {
  method: "GET" | "POST" | "DELETE";
  body?: unknown;
};

const REQUEST_TIMEOUT_MS = 15_000;

export class OpenWaApiError extends Error {
  status: number;
  code: string | null;

  constructor(message: string, status: number, code: string | null = null) {
    super(message);
    this.name = "OpenWaApiError";
    this.status = status;
    this.code = code;
  }
}

export async function createOpenWaSession(name: string) {
  return requestOpenWa<OpenWaSession>("/sessions", {
    method: "POST",
    body: { name },
  });
}

export async function startOpenWaSession(sessionId: string) {
  return requestOpenWa<OpenWaSession | { message?: string }>(
    `/sessions/${encodeURIComponent(sessionId)}/start`,
    { method: "POST" }
  );
}

export async function recoverOpenWaSession(sessionId: string) {
  let session = await getOpenWaSession(sessionId);
  if (isOpenWaSessionConnected(session)) return session;

  if (mapOpenWaSessionStatus(session.status) === "NOT_LINKED") {
    await startOpenWaSession(sessionId).catch(() => undefined);
    await sleep(2_000);
    session = await getOpenWaSession(sessionId);
  }

  return session;
}

export async function getOpenWaSession(sessionId: string) {
  return requestOpenWa<OpenWaSession>(
    `/sessions/${encodeURIComponent(sessionId)}`,
    { method: "GET" }
  );
}

export async function getOpenWaSessionQr(sessionId: string) {
  return requestOpenWa<OpenWaQr>(
    `/sessions/${encodeURIComponent(sessionId)}/qr`,
    { method: "GET" }
  );
}

export async function deleteOpenWaSession(sessionId: string) {
  return requestOpenWa<{ message?: string }>(
    `/sessions/${encodeURIComponent(sessionId)}`,
    { method: "DELETE" }
  );
}

export async function sendOpenWaImage(input: {
  sessionId: string;
  chatId: string;
  imageUrl: string;
  caption: string;
}) {
  return requestOpenWa<OpenWaMessageResult>(
    `/sessions/${encodeURIComponent(input.sessionId)}/messages/send-image`,
    {
      method: "POST",
      body: {
        chatId: input.chatId,
        url: input.imageUrl,
        caption: input.caption,
      },
    }
  );
}

export async function sendOpenWaText(input: {
  sessionId: string;
  chatId: string;
  text: string;
}) {
  return requestOpenWa<OpenWaMessageResult>(
    `/sessions/${encodeURIComponent(input.sessionId)}/messages/send-text`,
    {
      method: "POST",
      body: {
        chatId: input.chatId,
        text: input.text,
      },
    }
  );
}

export async function listOpenWaMessages(sessionId: string, limit = 30) {
  const payload = await requestOpenWa<
    | OpenWaInboundMessage[]
    | {
        messages?: OpenWaInboundMessage[];
        items?: OpenWaInboundMessage[];
        data?: OpenWaInboundMessage[];
      }
  >(
    `/sessions/${encodeURIComponent(sessionId)}/messages?limit=${encodeURIComponent(
      String(limit)
    )}`,
    { method: "GET" }
  );

  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.messages)) return payload.messages;
  if (Array.isArray(payload.items)) return payload.items;
  if (Array.isArray(payload.data)) return payload.data;

  return [];
}

export async function downloadOpenWaMessageMedia(input: {
  sessionId: string;
  messageId: string;
  mediaUrl?: string | null;
}) {
  if (input.mediaUrl) {
    return downloadOpenWaBytes(input.mediaUrl);
  }

  return requestOpenWaBytes(
    `/sessions/${encodeURIComponent(input.sessionId)}/messages/${encodeURIComponent(
      input.messageId
    )}/media`
  );
}

export function mapOpenWaSessionStatus(status: string | null | undefined) {
  switch ((status ?? "").toUpperCase()) {
    case "CONNECTED":
    case "READY":
    case "AUTHENTICATED":
      return "LINKED" as const;
    case "DISCONNECTED":
    case "LOGGED_OUT":
      return "NOT_LINKED" as const;
    case "ERROR":
    case "FAILED":
      return "FAILED" as const;
    default:
      return "LINKING" as const;
  }
}

export function getOpenWaQrImageDataUrl(qr: OpenWaQr | null) {
  if (!qr) return null;

  for (const candidate of [
    qr.image,
    qr.qrCode,
    qr.qrImage,
    qr.qrImageDataUrl,
    qr.qr,
  ]) {
    if (typeof candidate !== "string" || !candidate) continue;
    if (candidate.startsWith("data:image/")) return candidate;
    if (looksLikeBase64Image(candidate)) return `data:image/png;base64,${candidate}`;
  }

  for (const candidate of [
    qr.image,
    qr.qrCode,
    qr.qrImage,
    qr.qrImageDataUrl,
    qr.qr,
    qr.code,
  ]) {
    if (typeof candidate === "string" && candidate.startsWith("data:image/")) {
      return candidate;
    }
  }

  return null;
}

export function getOpenWaLinkedPhone(session: OpenWaSession | null) {
  const digits = getDigits(session?.phoneNumber ?? session?.phone ?? "");
  return digits ? `+${digits}` : null;
}

export function openWaPhonesMatch(expectedPhone: string | null, linkedPhone: string | null) {
  const expectedDigits = getDigits(expectedPhone ?? "");
  const linkedDigits = getDigits(linkedPhone ?? "");

  if (!expectedDigits || !linkedDigits) return true;
  return expectedDigits === linkedDigits;
}

export function isOpenWaSessionConnected(session: OpenWaSession | null) {
  return mapOpenWaSessionStatus(session?.status) === "LINKED";
}

async function requestOpenWa<T>(path: string, options: RequestOpenWaOptions) {
  const { baseUrl, apiKey } = getOpenWaConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(new URL(path.replace(/^\//, ""), baseUrl), {
      method: options.method,
      body: options.body ? JSON.stringify(options.body) : undefined,
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
    });

    const payload = await readOpenWaPayload<T>(response);

    if (!response.ok) {
      throw createOpenWaError(response, payload);
    }

    if (isOpenWaEnvelope<T>(payload)) {
      if (payload.success === false) {
        throw createOpenWaError(response, payload);
      }

      if ("data" in payload) return payload.data as T;
    }

    return payload as T;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("OpenWA Gateway API timed out.");
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function requestOpenWaBytes(path: string) {
  const { baseUrl, apiKey } = getOpenWaConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(new URL(path.replace(/^\//, ""), baseUrl), {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Accept: "*/*",
        "X-API-Key": apiKey,
      },
    });

    if (!response.ok) {
      const payload = await readOpenWaPayload<unknown>(response);
      throw createOpenWaError(response, payload);
    }

    return {
      bytes: Buffer.from(await response.arrayBuffer()),
      contentType: response.headers.get("content-type") || "image/jpeg",
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("OpenWA Gateway API timed out.");
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function downloadOpenWaBytes(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new OpenWaApiError(
        `OpenWA media download returned ${response.status}.`,
        response.status
      );
    }

    return {
      bytes: Buffer.from(await response.arrayBuffer()),
      contentType: response.headers.get("content-type") || "image/jpeg",
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("OpenWA media download timed out.");
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function getOpenWaConfig() {
  const baseUrl = process.env.OPENWA_API_BASE_URL;
  const apiKey =
    process.env.OPENWA_API_KEY ||
    readOptionalFile(process.env.OPENWA_API_KEY_FILE);

  if (!baseUrl || !apiKey) {
    throw new Error("OpenWA Gateway API is not configured.");
  }

  return {
    baseUrl: baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`,
    apiKey,
  };
}

async function readOpenWaPayload<T>(response: Response) {
  const text = await response.text();
  if (!text) return {} as T;

  try {
    return JSON.parse(text) as OpenWaEnvelope<T> | T;
  } catch {
    return { message: text } as OpenWaEnvelope<T>;
  }
}

function isOpenWaEnvelope<T>(value: OpenWaEnvelope<T> | T): value is OpenWaEnvelope<T> {
  return Boolean(
    value &&
      typeof value === "object" &&
      ("success" in value || "error" in value || "data" in value)
  );
}

function createOpenWaError<T>(
  response: Response,
  payload: OpenWaEnvelope<T> | T
) {
  const envelope =
    payload && typeof payload === "object" ? (payload as OpenWaEnvelope<T>) : null;
  const code = envelope?.error?.code ?? null;
  const message =
    envelope?.error?.message ??
    envelope?.message ??
    `OpenWA Gateway API returned ${response.status}.`;

  return new OpenWaApiError(message, response.status, code);
}

function getDigits(value: string) {
  return value.replace(/\D/g, "");
}

function looksLikeBase64Image(value: string) {
  return /^(iVBOR|\/9j\/|R0lGOD|UklGR)/.test(value);
}

function readOptionalFile(path: string | undefined) {
  if (!path) return "";

  try {
    return readFileSync(path, "utf8").trim();
  } catch {
    return "";
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
