"use client";

import { useState } from "react";
import {
  Bot, Globe, Code2, Calculator, ChevronDown, ChevronUp,
  CheckCircle2, Loader2, AlertCircle, Play,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface AgentStep {
  id: string;
  type: "thought" | "tool_call" | "tool_result" | "response";
  content: string;
  toolName?: string;
  status: "running" | "done" | "error";
  timestamp: string;
}

const TOOL_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  web_search: Globe,
  code_executor: Code2,
  calculator: Calculator,
};

const TOOL_COLOR: Record<string, string> = {
  web_search: "text-blue-500",
  code_executor: "text-purple-500",
  calculator: "text-orange-500",
  thought: "text-violet-500",
};

interface AgentStepCardProps {
  step: AgentStep;
}

export function AgentStepCard({ step }: AgentStepCardProps) {
  const [expanded, setExpanded] = useState(false);

  const isToolCall = step.type === "tool_call";
  const isToolResult = step.type === "tool_result";
  const isThought = step.type === "thought";

  const ToolIcon = isToolCall || isToolResult
    ? (TOOL_ICON[step.toolName ?? ""] ?? Bot)
    : Bot;

  const colorClass = isThought
    ? TOOL_COLOR.thought
    : TOOL_COLOR[step.toolName ?? ""] ?? "text-muted-foreground";

  const bgClass = isToolCall
    ? "border-blue-200 bg-blue-50/50 dark:border-blue-900/50 dark:bg-blue-950/20"
    : isToolResult
    ? "border-green-200 bg-green-50/50 dark:border-green-900/50 dark:bg-green-950/20"
    : "border-violet-200 bg-violet-50/50 dark:border-violet-900/50 dark:bg-violet-950/20";

  const label = isToolCall
    ? `Calling ${step.toolName}`
    : isToolResult
    ? `${step.toolName} result`
    : "Reasoning";

  return (
    <div className={cn("rounded-lg border text-xs overflow-hidden", bgClass)}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-left"
      >
        {step.status === "running" ? (
          <Loader2 className={cn("h-3.5 w-3.5 animate-spin flex-shrink-0", colorClass)} />
        ) : step.status === "error" ? (
          <AlertCircle className="h-3.5 w-3.5 text-destructive flex-shrink-0" />
        ) : (
          <ToolIcon className={cn("h-3.5 w-3.5 flex-shrink-0", colorClass)} />
        )}
        <span className="font-medium flex-1">{label}</span>
        <span className="text-muted-foreground">{step.timestamp}</span>
        {expanded
          ? <ChevronUp className="h-3 w-3 text-muted-foreground" />
          : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
      </button>
      {expanded && (
        <div className="px-3 pb-2.5 border-t">
          <pre className="mt-2 whitespace-pre-wrap font-mono text-[11px] text-muted-foreground max-h-40 overflow-y-auto">
            {step.content}
          </pre>
        </div>
      )}
    </div>
  );
}

interface AgentModeBadgeProps {
  active: boolean;
  onClick: () => void;
  tools: string[];
}

export function AgentModeBadge({ active, onClick, tools }: AgentModeBadgeProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
        active
          ? "bg-primary text-primary-foreground border-primary shadow-sm"
          : "bg-background text-muted-foreground border-border hover:border-primary/50 hover:text-primary"
      )}
    >
      <Bot className="h-3.5 w-3.5" />
      Agent Mode
      {active && (
        <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground animate-pulse" />
      )}
    </button>
  );
}

interface AvailableToolsProps {
  tools: string[];
  selected: Set<string>;
  onToggle: (tool: string) => void;
}

const ALL_TOOLS = [
  { id: "web_search", label: "Web Search", icon: Globe, description: "Search the internet" },
  { id: "code_executor", label: "Code Executor", icon: Code2, description: "Run code in sandbox" },
  { id: "calculator", label: "Calculator", icon: Calculator, description: "Math & computation" },
];

export function AvailableTools({ selected, onToggle }: AvailableToolsProps) {
  return (
    <div className="flex flex-wrap gap-2 px-3 pb-2">
      {ALL_TOOLS.map((tool) => {
        const Icon = tool.icon;
        const isSelected = selected.has(tool.id);
        return (
          <button
            key={tool.id}
            onClick={() => onToggle(tool.id)}
            title={tool.description}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all",
              isSelected
                ? "bg-primary/10 text-primary border-primary/40"
                : "bg-background text-muted-foreground border-border hover:border-primary/30"
            )}
          >
            <Icon className="h-3 w-3" />
            {tool.label}
            {isSelected && <CheckCircle2 className="h-3 w-3" />}
          </button>
        );
      })}
    </div>
  );
}
