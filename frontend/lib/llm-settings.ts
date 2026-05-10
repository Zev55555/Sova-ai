export type LlmProvider = "openai" | "deepseek" | "openai-compatible" | "custom";

export type LlmStorageMode = "session" | "local";

export type LlmSettings = {
  provider: LlmProvider;
  apiKey: string;
  baseUrl: string;
  model: string;
  storageMode: LlmStorageMode;
};

export type LlmTestResult = {
  success: boolean;
  message: string;
};

export const sessionSettingsKey = "sova-ai-llm-settings-session";
export const localSettingsKey = "sova-ai-llm-settings-local";

export const defaultLlmSettings: LlmSettings = {
  provider: "openai",
  apiKey: "",
  baseUrl: "https://api.openai.com/v1",
  model: "",
  storageMode: "session",
};

export const providerDefaults: Record<LlmProvider, { baseUrl: string }> = {
  openai: {
    baseUrl: "https://api.openai.com/v1",
  },
  deepseek: {
    baseUrl: "https://api.deepseek.com",
  },
  "openai-compatible": {
    baseUrl: "",
  },
  custom: {
    baseUrl: "",
  },
};

export function getInitialLlmSettings(): LlmSettings {
  if (typeof window === "undefined") {
    return defaultLlmSettings;
  }

  const localSettings = readSettings(localStorage.getItem(localSettingsKey));
  if (localSettings) {
    return { ...localSettings, storageMode: "local" };
  }

  const sessionSettings = readSettings(sessionStorage.getItem(sessionSettingsKey));
  if (sessionSettings) {
    return { ...sessionSettings, storageMode: "session" };
  }

  return defaultLlmSettings;
}

export function saveLlmSettings(settings: LlmSettings) {
  if (typeof window === "undefined") {
    return;
  }

  const payload = JSON.stringify(settings);
  if (settings.storageMode === "local") {
    localStorage.setItem(localSettingsKey, payload);
    sessionStorage.removeItem(sessionSettingsKey);
    return;
  }

  sessionStorage.setItem(sessionSettingsKey, payload);
  localStorage.removeItem(localSettingsKey);
}

export function isLlmConfigured(settings: LlmSettings) {
  return Boolean(
    settings.apiKey.trim() && settings.baseUrl.trim() && settings.model.trim(),
  );
}

export async function testLlmConnection(
  settings: LlmSettings,
): Promise<LlmTestResult> {
  const apiBaseUrl =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

  const response = await fetch(`${apiBaseUrl}/api/llm/test`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      provider: settings.provider,
      api_key: settings.apiKey,
      base_url: settings.baseUrl,
      model: settings.model,
    }),
  });

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => null);
    const detail =
      typeof errorPayload?.detail === "string"
        ? errorPayload.detail
        : "连接失败，请检查 API Key、Base URL、模型名称或网络环境。";
    throw new Error(detail);
  }

  return (await response.json()) as LlmTestResult;
}

function readSettings(rawValue: string | null): LlmSettings | null {
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<LlmSettings>;
    if (!parsed.provider) {
      return null;
    }

    return {
      ...defaultLlmSettings,
      ...parsed,
    };
  } catch {
    return null;
  }
}
