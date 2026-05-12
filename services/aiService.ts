const VERCEL_API_BASE_URL = "https://fyp-ai-backend.vercel.app/api";
const DEFAULT_REQUEST_TIMEOUT_MS = 35000;

export type VoiceExpenseResult = {
  amount: number;
  category: string;
  item_description: string;
  type: "expense";
  date: string;
  confidence?: number;
  note?: string;
};

export type ReceiptScanResult = {
  merchant_name: string;
  total_amount: number;
  amount: number;
  category: string;
  item_description: string;
  transaction_date: string;
  date: string;
  currency: string;
  type: "expense";
  confidence?: number;
  note?: string;
};

async function postJson<T>(
  path: string,
  body: Record<string, unknown>,
  timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(`${VERCEL_API_BASE_URL}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Request timed out. Please try again with a clearer receipt photo.");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.error || `Server Error: ${response.status}`);
  }

  return data as T;
}

export const parseVoiceExpense = async (
  transcript: string,
  userCategories: string[],
  currentDate: string,
) => {
  return postJson<VoiceExpenseResult>("/parse-voice", {
    transcript,
    userCategories,
    currentDate,
  });
};

export const parseVoiceAudio = async (
  audioBase64: string,
  mimeType: string,
  userCategories: string[],
  currentDate: string,
) => {
  return postJson<VoiceExpenseResult>("/parse-voice", {
    audioBase64,
    mimeType,
    userCategories,
    currentDate,
  });
};

export const parseTransactionText = async (
  userInput: string,
  userCategories: string[],
) => {
  const currentDate = new Date().toISOString().slice(0, 10);
  return parseVoiceExpense(userInput, userCategories, currentDate);
};

export const scanReceiptImage = async (
  imageBase64: string,
  mimeType: string,
  userCategories: string[],
  currentDate: string,
) => {
  return postJson<ReceiptScanResult>(
    "/scan-receipt",
    {
      imageBase64,
      mimeType,
      userCategories,
      currentDate,
    },
    45000,
  );
};
