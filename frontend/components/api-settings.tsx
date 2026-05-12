"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  defaultLlmSettings,
  getInitialLlmSettings,
  isLlmConfigured,
  providerDefaults,
  saveLlmSettings,
  testLlmConnection,
  type LlmProvider,
  type LlmSettings,
  type LlmStorageMode,
} from "@/lib/llm-settings";

const providerOptions: Array<{
  id: LlmProvider;
  title: string;
  description: string;
}> = [
  {
    id: "openai",
    title: "OpenAI",
    description: "使用 OpenAI 官方 API",
  },
  {
    id: "deepseek",
    title: "DeepSeek",
    description: "使用 DeepSeek API",
  },
  {
    id: "openai-compatible",
    title: "OpenAI-Compatible",
    description: "兼容 OpenAI Chat Completions 格式的第三方服务",
  },
  {
    id: "custom",
    title: "自定义",
    description: "手动配置 API Base URL 和模型名称",
  },
];

const storageOptions: Array<{
  id: LlmStorageMode;
  title: string;
  description: string;
}> = [
  {
    id: "session",
    title: "仅本次会话保存",
    description: "刷新或关闭页面后可能失效。",
  },
  {
    id: "local",
    title: "保存到本地浏览器",
    description: "API Key 会保存在当前设备浏览器中，请不要在公共电脑上保存。",
  },
];

const deepSeekModelOptions = [
  {
    id: "deepseek-v4-pro",
    title: "DeepSeek V4 Pro",
    description: "默认质量优先，适合业务澄清、证据链和报告表达。",
  },
  {
    id: "deepseek-v4-flash",
    title: "DeepSeek V4 Flash",
    description: "速度优先，适合更快完成澄清和草稿生成。",
  },
];

type ApiSettingsProps = {
  variant?: "header" | "sidebar";
};

export function ApiSettings({ variant = "header" }: ApiSettingsProps) {
  const [isMounted, setIsMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [settings, setSettings] = useState<LlmSettings>(defaultLlmSettings);
  const [isConfigured, setIsConfigured] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [testMessage, setTestMessage] = useState("");
  const [testTone, setTestTone] = useState<"success" | "error" | "idle">("idle");
  const [isTesting, setIsTesting] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    const initialSettings = getInitialLlmSettings();
    setSettings(initialSettings);
    setIsConfigured(isLlmConfigured(initialSettings));
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  function handleProviderChange(provider: LlmProvider) {
    setSettings((current) => ({
      ...current,
      provider,
      baseUrl: providerDefaults[provider].baseUrl,
      model: providerDefaults[provider].model,
    }));
    clearTransientMessages();
  }

  function handleSaveSettings() {
    saveLlmSettings(settings);
    setIsConfigured(isLlmConfigured(settings));
    setSaveMessage("设置已保存");
    setTestMessage("");
    setTestTone("idle");
  }

  async function handleTestConnection() {
    setIsTesting(true);
    setTestMessage("");
    setTestTone("idle");

    try {
      const result = await testLlmConnection(settings);
      setTestMessage(result.message || "连接成功，模型可用。");
      setTestTone("success");
    } catch (error) {
      setTestMessage(
        error instanceof Error
          ? error.message
          : "连接失败，请检查 API Key、Base URL、模型名称或网络环境。",
      );
      setTestTone("error");
    } finally {
      setIsTesting(false);
    }
  }

  function clearTransientMessages() {
    setSaveMessage("");
    setTestMessage("");
    setTestTone("idle");
  }

  const trigger =
    variant === "sidebar" ? (
      <button
        className="flex w-full items-center justify-between rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2 text-left text-sm font-medium text-ink/68 transition hover:border-accent/30 hover:bg-accent/8 hover:text-accent focus:outline-none focus:ring-4 focus:ring-accent/18"
        onClick={() => setIsOpen(true)}
        type="button"
      >
        <span>AI 设置</span>
        <span
          className={`h-2 w-2 rounded-full ${
            isConfigured ? "bg-accent" : "bg-ink/28"
          }`}
        />
      </button>
    ) : (
      <button
        className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-ink/66 transition hover:border-accent/32 hover:bg-accent/8 hover:text-accent focus:outline-none focus:ring-4 focus:ring-accent/18"
        onClick={() => setIsOpen(true)}
        type="button"
      >
        <span
          className={`h-2.5 w-2.5 rounded-full ${
            isConfigured ? "bg-accent" : "bg-ink/28"
          }`}
        />
        API 设置
      </button>
    );

  return (
    <>
      {trigger}

      {isMounted && isOpen
        ? createPortal(
            <div
              aria-modal="true"
              className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-ink/40 px-3 py-5 backdrop-blur-sm sm:px-6"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) {
                  setIsOpen(false);
                }
              }}
              role="dialog"
            >
              <section
                className="api-settings-dialog flex max-h-[85vh] w-full max-w-[900px] flex-col overflow-hidden rounded-lg border border-white/10 bg-surface shadow-sm"
                onMouseDown={(event) => event.stopPropagation()}
              >
            <div className="shrink-0 border-b border-ink/10 px-5 py-5 sm:px-7 sm:py-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-accent">SOVA AI</p>
                  <h2 className="mt-1 text-2xl font-semibold text-ink">
                    API 设置
                  </h2>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-ink/64">
                    配置 AI 服务商、API Key、Base URL 和模型名称。当前设置将用于后续真实 AI 功能接入。
                  </p>
                </div>
                <button
                  className="w-fit rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-ink/62 transition hover:border-accent/40 hover:text-accent focus:outline-none focus:ring-4 focus:ring-accent/18"
                  onClick={() => setIsOpen(false)}
                  type="button"
                >
                  关闭
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">
              <div className="space-y-5">
                <section className="rounded-xl border border-ink/10 bg-white/82 p-5">
                  <div>
                    <h3 className="text-base font-semibold text-ink">
                      AI 服务商
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-ink/58">
                      选择用于后续真实 AI 能力接入的服务商。当前业务分析流程仍保持规则版逻辑。
                    </p>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {providerOptions.map((provider) => (
                    <button
                      className={`flex min-h-32 flex-col justify-between rounded-lg border p-4 text-left transition focus:outline-none focus:ring-4 focus:ring-accent/18 ${
                        settings.provider === provider.id
                          ? "border-accent bg-accent/10 shadow-sm"
                          : "border-ink/10 bg-white hover:border-accent/35 hover:bg-surface/70"
                      }`}
                      key={provider.id}
                      onClick={() => handleProviderChange(provider.id)}
                      type="button"
                    >
                      <span>
                        <span className="text-base font-semibold text-ink">
                          {provider.title}
                        </span>
                        <span className="mt-2 block text-sm leading-6 text-ink/60">
                          {provider.description}
                        </span>
                      </span>
                      {settings.provider === provider.id ? (
                        <span className="mt-4 text-xs font-semibold text-accent">
                          已选择
                        </span>
                      ) : null}
                    </button>
                  ))}
                  </div>
                </section>

                <section className="rounded-xl border border-ink/10 bg-white/82 p-5">
                  <div>
                    <h3 className="text-base font-semibold text-ink">
                      连接参数
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-ink/58">
                      API Base URL 会根据服务商自动填充默认值，你也可以按服务商文档手动修改。
                    </p>
                  </div>
                  <div className="mt-5 grid gap-4">
                    {settings.provider === "deepseek" ? (
                      <>
                        <div className="rounded-xl border border-accent/20 bg-accent/10 px-4 py-3 text-sm leading-6 text-ink/72">
                          {"\u9ed8\u8ba4\u63a5\u5165 DeepSeek\u3002\u4f60\u4e0d\u9700\u8981\u586b\u5199 API Key\uff0cSOVA AI \u4f1a\u4f7f\u7528\u670d\u52a1\u7aef\u6258\u7ba1\u7684 DeepSeek \u914d\u7f6e\uff1b\u8fd9\u91cc\u4ec5\u9009\u62e9\u9ed8\u8ba4\u6a21\u578b\u3002"}
                        </div>
                        <div className="rounded-xl border border-amber-300/30 bg-amber-400/10 px-4 py-3 text-sm leading-6 text-amber-100/88">
                          DeepSeek 在长文本和结构化 JSON 分析任务中响应较慢，尤其是上传数据后的字段语义识别。如果你更看重速度和稳定性，建议在这里选择 OpenAI 并使用自己的 OpenAI API。
                        </div>
                        <FormField label="DeepSeek model">
                          <div className="grid gap-3 sm:grid-cols-2">
                            {deepSeekModelOptions.map((option) => (
                              <button
                                className={`rounded-xl border p-4 text-left transition focus:outline-none focus:ring-4 focus:ring-accent/18 ${
                                  settings.model === option.id
                                    ? "border-accent bg-accent/10 text-ink"
                                    : "border-ink/10 bg-white text-ink/72 hover:border-accent/35 hover:bg-surface/70"
                                }`}
                                key={option.id}
                                onClick={() => {
                                  setSettings((current) => ({
                                    ...current,
                                    provider: "deepseek",
                                    apiKey: "",
                                    baseUrl: providerDefaults.deepseek.baseUrl,
                                    model: option.id,
                                  }));
                                  clearTransientMessages();
                                }}
                                type="button"
                              >
                                <span className="block text-sm font-semibold">
                                  {option.title}
                                </span>
                                <span className="mt-2 block text-sm leading-6 text-ink/58">
                                  {option.description}
                                </span>
                              </button>
                            ))}
                          </div>
                        </FormField>
                      </>
                    ) : (
                      <>
                        <FormField label="API Key">
                          <div className="flex flex-col gap-2 sm:flex-row">
                            <input
                              className="min-w-0 flex-1 rounded-lg border border-ink/12 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/12"
                              onChange={(event) => {
                                setSettings((current) => ({
                                  ...current,
                                  apiKey: event.target.value,
                                }));
                                clearTransientMessages();
                              }}
                              placeholder="API Key"
                              type="password"
                              value={settings.apiKey}
                            />
                            <span className="rounded-lg border border-ink/12 bg-white px-4 py-3 text-sm font-semibold text-ink/48 sm:shrink-0">
                              Hidden
                            </span>
                          </div>
                        </FormField>

                        <FormField label="API Base URL">
                          <input
                            className="w-full rounded-lg border border-ink/12 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/12"
                            onChange={(event) => {
                              setSettings((current) => ({
                                ...current,
                                baseUrl: event.target.value,
                              }));
                              clearTransientMessages();
                            }}
                            placeholder="API Base URL"
                            value={settings.baseUrl}
                          />
                        </FormField>

                        <FormField label="Model">
                          <input
                            className="w-full rounded-lg border border-ink/12 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/12"
                            onChange={(event) => {
                              setSettings((current) => ({
                                ...current,
                                model: event.target.value,
                              }));
                              clearTransientMessages();
                            }}
                            placeholder="gpt-5-mini, deepseek-v4-flash, or another supported model"
                            value={settings.model}
                          />
                        </FormField>
                      </>
                    )}
                  </div>
                </section>

                <section className="rounded-xl border border-ink/10 bg-white/82 p-5">
                  <div>
                    <h3 className="text-base font-semibold text-ink">
                      保存方式
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-ink/58">
                      选择 API 配置保存在当前会话，还是保存在当前设备浏览器中。
                    </p>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {storageOptions.map((option) => (
                    <button
                      className={`flex min-h-28 flex-col justify-between rounded-lg border p-4 text-left transition focus:outline-none focus:ring-4 focus:ring-accent/18 ${
                        settings.storageMode === option.id
                          ? "border-accent bg-accent/10 shadow-sm"
                          : "border-ink/10 bg-white hover:border-accent/35 hover:bg-surface/70"
                      }`}
                      key={option.id}
                      onClick={() => {
                        setSettings((current) => ({
                          ...current,
                          storageMode: option.id,
                        }));
                        clearTransientMessages();
                      }}
                      type="button"
                    >
                      <span>
                        <span className="text-sm font-semibold text-ink">
                          {option.title}
                        </span>
                        <span className="mt-2 block text-sm leading-6 text-ink/60">
                          {option.description}
                        </span>
                      </span>
                      {settings.storageMode === option.id ? (
                        <span className="mt-4 text-xs font-semibold text-accent">
                          已选择
                        </span>
                      ) : null}
                    </button>
                  ))}
                  </div>
                </section>

                <section className="rounded-xl border border-amber-200 bg-amber-50 p-5">
                  <h3 className="text-base font-semibold text-amber-800">
                    安全提示
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-amber-800/82">
                    你的 API Key 只用于向所选 AI 服务商发起请求。本工具不会将 API Key 保存到数据库，也不会在页面或日志中展示完整 Key。若选择“保存到本地浏览器”，Key 会保存在当前设备浏览器存储中，请不要在公共电脑上保存。
                  </p>
                </section>
              </div>
            </div>

            <div className="shrink-0 border-t border-ink/10 bg-surface/95 px-5 py-4 sm:px-7">
              {(saveMessage || testMessage) ? (
                <div className="mb-3">
                  {saveMessage ? (
                    <p className="rounded-md border border-accent/20 bg-accent/10 px-4 py-3 text-sm font-medium text-accent">
                      {saveMessage}
                    </p>
                  ) : null}

                  {testMessage ? (
                    <p
                      className={`rounded-md border px-4 py-3 text-sm font-medium ${
                        testTone === "success"
                          ? "border-accent/20 bg-accent/10 text-accent"
                          : "border-red-200 bg-red-50 text-red-700"
                      } ${saveMessage ? "mt-2" : ""}`}
                    >
                      {testMessage}
                    </p>
                  ) : null}
                </div>
              ) : null}

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <button
                  className="rounded-lg border border-accent/30 bg-accent/10 px-5 py-3 text-sm font-semibold text-accent transition hover:border-accent hover:bg-accent/15 focus:outline-none focus:ring-4 focus:ring-accent/18 disabled:cursor-not-allowed disabled:border-ink/12 disabled:bg-ink/5 disabled:text-ink/42"
                  disabled={isTesting}
                  onClick={handleTestConnection}
                  type="button"
                >
                  {isTesting ? "正在测试连接……" : "测试连接"}
                </button>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <button
                    className="rounded-lg border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-ink/68 transition hover:border-accent/40 hover:text-accent focus:outline-none focus:ring-4 focus:ring-accent/18"
                    onClick={() => setIsOpen(false)}
                    type="button"
                  >
                    取消
                  </button>
                  <button
                    className="rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent/85 focus:outline-none focus:ring-4 focus:ring-accent/18"
                    onClick={handleSaveSettings}
                    type="button"
                  >
                    保存设置
                  </button>
                </div>
              </div>
            </div>
              </section>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function FormField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-ink">{label}</span>
      <span className="mt-2 block">{children}</span>
    </label>
  );
}
