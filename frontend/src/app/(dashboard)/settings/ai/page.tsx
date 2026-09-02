"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle, Eye, EyeOff, Loader2, Sparkles, XCircle } from "lucide-react";
import { RequirePermission } from "@/components/auth/require-permission";
import { useToast } from "@/providers/toast-provider";
import { apiClient } from "@/lib/api-client";
import { cn } from "@/lib/utils";

interface AiSettings {
  provider: "openai" | "anthropic" | null;
  model: string | null;
  business_context: string | null;
  enabled: boolean;
  has_api_key: boolean;
}

const DEFAULT_MODELS: Record<"openai" | "anthropic", string> = {
  openai: "gpt-4o-mini",
  anthropic: "claude-haiku-4-20250414",
};

const PROVIDER_LABELS: Record<"openai" | "anthropic", string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
};

function AiSettingsContent() {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<"success" | "error" | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);

  const [provider, setProvider] = useState<"openai" | "anthropic">("openai");
  const [model, setModel] = useState(DEFAULT_MODELS.openai);
  const [apiKey, setApiKey] = useState("");
  const [businessContext, setBusinessContext] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);

  const loadSettings = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await apiClient.get<{ data: AiSettings }>("/ai-assistant/settings");
      const data = response.data.data;
      const nextProvider = data.provider || "openai";
      setProvider(nextProvider);
      setModel(data.model || DEFAULT_MODELS[nextProvider]);
      setBusinessContext(data.business_context || "");
      setEnabled(data.enabled);
      setHasApiKey(data.has_api_key);
    } catch {
      toast("Unable to load AI settings.", "error");
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadSettings();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadSettings]);

  const handleProviderChange = (newProvider: "openai" | "anthropic") => {
    setProvider(newProvider);
    if (!model || model === DEFAULT_MODELS[provider === "openai" ? "anthropic" : "openai"]) {
      setModel(DEFAULT_MODELS[newProvider]);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setTestResult(null);
    try {
      const payload: Record<string, unknown> = {
        provider,
        model,
        business_context: businessContext || null,
        enabled,
      };
      if (apiKey) payload.api_key = apiKey;
      await apiClient.patch("/ai-assistant/settings", payload);
      const savedApiKey = Boolean(apiKey);
      toast("AI settings saved.", "success");
      setApiKey("");
      setHasApiKey((current) => current || savedApiKey);
      await loadSettings();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unable to save AI settings.";
      toast(message, "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestKey = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      await apiClient.post("/ai-assistant/test", {
        provider,
        model,
        api_key: apiKey,
      });
      setTestResult("success");
      toast("API key is valid.", "success");
    } catch {
      setTestResult("error");
      toast("API key validation failed.", "error");
    } finally {
      setIsTesting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-2xl space-y-6">
        <div>
          <div className="h-8 w-48 animate-pulse rounded bg-border/60" />
          <div className="mt-2 h-4 w-72 animate-pulse rounded bg-border/60" />
        </div>
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-border/60" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text">AI Assistant</h1>
        <p className="mt-1 text-sm text-muted">
          Configure AI-powered draft replies for conversations. Uses your own API key.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-surface p-6 space-y-5">
        <div>
          <label className="text-sm font-medium text-text">Provider</label>
          <div className="mt-2 flex gap-3">
            {(["openai", "anthropic"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => handleProviderChange(p)}
                className={cn(
                  "flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors",
                  provider === p
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted hover:bg-bg hover:text-text"
                )}
              >
                {provider === p && <CheckCircle className="h-4 w-4" />}
                {PROVIDER_LABELS[p]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="ai-model" className="text-sm font-medium text-text">
            Model
          </label>
          <input
            id="ai-model"
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder={DEFAULT_MODELS[provider]}
            className="mt-2 w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <p className="mt-1 text-xs text-muted">
            Default: {DEFAULT_MODELS[provider]}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface p-6 space-y-4">
        <div>
          <label htmlFor="ai-api-key" className="text-sm font-medium text-text">
            API Key
          </label>
          <p className="mt-0.5 text-xs text-muted">
            {hasApiKey
              ? "An API key is configured. Enter a new key to replace it."
              : "No API key configured yet."}
          </p>
          <div className="mt-2 relative">
            <input
              id="ai-api-key"
              type={showApiKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={hasApiKey ? "****************" : `Enter your ${PROVIDER_LABELS[provider]} API key`}
              className="w-full rounded-xl border border-border bg-bg px-3 py-2 pr-10 text-sm text-text placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <button
              type="button"
              onClick={() => setShowApiKey(!showApiKey)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1 text-muted hover:text-text"
              aria-label={showApiKey ? "Hide API key" : "Show API key"}
            >
              {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleTestKey}
            disabled={isTesting || !apiKey}
            className="flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-medium text-text hover:bg-bg disabled:opacity-50"
          >
            {isTesting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : testResult === "success" ? (
              <CheckCircle className="h-4 w-4 text-success" />
            ) : testResult === "error" ? (
              <XCircle className="h-4 w-4 text-danger" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {isTesting ? "Testing..." : testResult === "success" ? "Key valid" : testResult === "error" ? "Key invalid" : "Test key"}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface p-6 space-y-3">
        <div>
          <label htmlFor="ai-context" className="text-sm font-medium text-text">
            Business Context
          </label>
          <p className="mt-0.5 text-xs text-muted">
            Additional instructions appended to the AI system prompt. Describe your business, products, policies, or tone of voice.
          </p>
          <textarea
            id="ai-context"
            value={businessContext}
            onChange={(e) => setBusinessContext(e.target.value)}
            placeholder="e.g. We are an e-commerce store selling organic skincare products. Respond in a friendly, helpful tone. Never make promises about delivery times."
            rows={5}
            className="mt-2 w-full resize-none rounded-xl border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-text">Enable AI Draft</p>
            <p className="mt-0.5 text-xs text-muted">
              Show the AI draft button in the conversation composer.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            onClick={() => setEnabled(!enabled)}
            className={cn(
              "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
              enabled ? "bg-primary" : "bg-border"
            )}
          >
            <span
              className={cn(
                "pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform",
                enabled ? "translate-x-5" : "translate-x-0"
              )}
            />
          </button>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving || !provider || !model}
          className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50"
        >
          {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
          {isSaving ? "Saving..." : "Save settings"}
        </button>
      </div>
    </div>
  );
}

export default function AiSettingsPage() {
  return (
    <RequirePermission permission="workspace.settings.manage">
      <AiSettingsContent />
    </RequirePermission>
  );
}
