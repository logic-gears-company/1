// ─── API Response types ───────────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  data: T;
  message?: string;
  meta?: PaginationMeta;
}

export interface ApiError {
  error: string;
  message: string;
  statusCode: number;
  details?: Record<string, string[]>;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface PaginationParams {
  page?: number;
  pageSize?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

// ─── Auth types ───────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  email: string;
  name?: string | null;
  image?: string | null;
  role: "USER" | "ADMIN" | "SUPER_ADMIN";
  stripeCustomerId?: string | null;
}

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  iat?: number;
  exp?: number;
}

// ─── AI / Chat types ──────────────────────────────────────────────────────────

export type AiProvider = "openai" | "anthropic" | "ollama";

export type MessageRole = "user" | "assistant" | "system" | "tool";

export interface ChatMessage {
  id?: string;
  role: MessageRole;
  content: string;
  model?: string;
  provider?: AiProvider;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  toolCalls?: ToolCall[];
  attachments?: FileAttachment[];
  createdAt?: string;
}

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface ChatRequest {
  conversationId?: string;
  message: string;
  model?: string;
  provider?: AiProvider;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  attachmentIds?: string[];
}

export interface StreamChunk {
  type: "content" | "done" | "error" | "tool_call";
  content?: string;
  error?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  conversationId?: string;
  messageId?: string;
}

// ─── File types ───────────────────────────────────────────────────────────────

export interface FileAttachment {
  fileId: string;
  name: string;
  mimeType: string;
  url: string;
  size: number;
}

export type FileUploadStatus = "uploading" | "processing" | "ready" | "failed";

// ─── Billing types ────────────────────────────────────────────────────────────

export type PlanTier = "FREE" | "PRO" | "ENTERPRISE";
export type BillingInterval = "MONTHLY" | "YEARLY";
export type SubscriptionStatus =
  | "TRIALING"
  | "ACTIVE"
  | "CANCELED"
  | "INCOMPLETE"
  | "PAST_DUE"
  | "UNPAID"
  | "PAUSED";

export interface PlanFeature {
  name: string;
  included: boolean;
  limit?: number | string;
}

// ─── Agent types ──────────────────────────────────────────────────────────────

export type AgentStatus = "idle" | "running" | "completed" | "failed" | "paused";

export interface AgentTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface AgentStep {
  id: string;
  type: "thought" | "tool_call" | "tool_result" | "response";
  content: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolOutput?: unknown;
  timestamp: string;
}

export interface AgentRunResult {
  id: string;
  status: AgentStatus;
  steps: AgentStep[];
  output?: string;
  tokensUsed: number;
  error?: string;
}

// ─── RAG types ────────────────────────────────────────────────────────────────

export interface SearchResult {
  id: string;
  content: string;
  score: number;
  metadata?: Record<string, unknown>;
  fileId?: string;
  fileName?: string;
}

export interface EmbeddingRequest {
  texts: string[];
  model?: string;
}

// ─── Usage types ─────────────────────────────────────────────────────────────

export interface UsageStats {
  tokensUsed: number;
  tokensLimit: number;
  messagesUsed: number;
  messagesLimit: number;
  storageUsed: number;
  storageLimit: number;
  percentUsed: number;
}

// ─── Notification types ───────────────────────────────────────────────────────

export type NotificationType = "info" | "success" | "warning" | "error";

export interface NotificationPayload {
  title: string;
  body: string;
  type: NotificationType;
  link?: string;
}
