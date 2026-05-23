export type WhatsAppLinkStatusValue =
  | "NOT_LINKED"
  | "LINKING"
  | "LINKED"
  | "FAILED";

export type WhatsAppWorkerSessionStatus = {
  status: WhatsAppLinkStatusValue;
  sessionId: string | null;
  qrImageDataUrl: string | null;
  linkedPhone: string | null;
  errorMessage: string | null;
  updatedAt: string | null;
};

type StartWorkerSessionInput = {
  userId: string;
  sessionId: string;
  expectedPhone: string;
};

const REQUEST_TIMEOUT_MS = 10_000;

export async function startWorkerSession(input: StartWorkerSessionInput) {
  await requestWorker<WhatsAppWorkerSessionStatus>("/sessions/start", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function getWorkerSessionStatus(sessionId: string) {
  return requestWorker<WhatsAppWorkerSessionStatus>(
    `/sessions/${encodeURIComponent(sessionId)}/status`,
    { method: "GET" }
  );
}

async function requestWorker<T>(
  path: string,
  init: Pick<RequestInit, "method" | "body">
) {
  const { baseUrl, token } = getWorkerConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(new URL(path, baseUrl), {
      method: init.method,
      body: init.body,
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(await getWorkerError(response));
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("WhatsApp worker API timed out.");
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function getWorkerConfig() {
  const baseUrl = process.env.WHATSAPP_WORKER_BASE_URL;
  const token = process.env.WHATSAPP_WORKER_API_TOKEN;

  if (!baseUrl || !token) {
    throw new Error("WhatsApp worker API is not configured.");
  }

  return {
    baseUrl: baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`,
    token,
  };
}

async function getWorkerError(response: Response) {
  try {
    const data = (await response.json()) as { error?: unknown };
    if (typeof data.error === "string" && data.error) return data.error;
  } catch {
    // Fall through to the generic status message.
  }

  return `WhatsApp worker API returned ${response.status}.`;
}
