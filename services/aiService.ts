const VERCEL_API_BASE_URL = "https://fyp-ai-backend.vercel.app/api";

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

async function postJson<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${VERCEL_API_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

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
  return postJson<ReceiptScanResult>("/scan-receipt", {
    imageBase64,
    mimeType,
    userCategories,
    currentDate,
  });
};
