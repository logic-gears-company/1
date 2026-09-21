"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Bot, Plus, Play, Trash2, Globe, Code2, Calculator,
  ArrowRight, CheckCircle2, XCircle, Clock, Zap, Settings2,
  ChevronDown, ChevronUp, Loader2, Copy, Check, Search,
  MoreHorizontal, PenLine, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { sileo } from "sileo";
import type { AgentStep } from "@/components/chat/agent-mode-panel";

// ─── Types ───────────────────────────────────────────────────────────────────

interface AgentWorkflow {
  id: string;
  name: string;
  description: string | null;
  status: string;
  enabledTools: string[];
  definition: {
    model?: string;
    maxIterations?: number;
    temperature?: number;
    systemPrompt?: string;
  };
  createdAt: string;
  updatedAt: string;
  _count: { runs: number };
  runs: Array<{ status: string; createdAt: string }>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MODELS = [
  { value: "gpt-4o-mini", label: "GPT-4o mini (Fast)" },
  { value: "gpt-4o", label: "GPT-4o (Powerful)" },
  { value: "claude-3-5-haiku-20241022", label: "Claude 3.5 Haiku" },
  { value: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet" },
];

const TOOLS = [
  { id: "web_search", label: "Web Search", icon: Globe, description: "Search the internet for current information" },
  { id: "calculator", label: "Calculator", icon: Calculator, description: "Evaluate mathematical expressions" },
  { id: "code_executor", label: "Code Executor", icon: Code2, description: "Write and explain code solutions" },
];

const TEMPLATES = [
  {
    name: "Research Assistant",
    description: "Searches the web and synthesizes comprehensive reports on any topic",
    icon: "🔍",
    tools: ["web_search"],
    systemPrompt: "You are a research assistant. Search the web for relevant information and synthesize it into a clear, well-structured report with key findings and sources.",
    model: "gpt-4o-mini",
    href: "/agents/templates/research",
  },
  {
    name: "Data Analyst",
    description: "Analyzes data, performs calculations, and generates actionable insights",
    icon: "📊",
    tools: ["calculator", "code_executor"],
    systemPrompt: "You are a data analyst. Perform calculations, write analysis code, and provide clear insights with numbers and visualizations.",
    model: "gpt-4o",
    href: null,
  },
  {
    name: "Code Reviewer",
    description: "Reviews code for bugs, security issues, and best practices",
    icon: "🛡️",
    tools: ["code_executor", "web_search"],
    systemPrompt: "You are an expert code reviewer. Analyze code for bugs, security vulnerabilities, performance issues, and style problems. Provide specific, actionable feedback.",
    model: "gpt-4o",
    href: null,
  },
  {
    name: "Content Writer",
    description: "Creates high-quality content with research backing",
    icon: "✍️",
    tools: ["web_search"],
    systemPrompt: "You are a professional content writer. Research the topic thoroughly and craft engaging, accurate, and well-structured content.",
    model: "gpt-4o-mini",
    href: null,
  },
];

const STATUS_MAP = {
  COMPLETED: { icon: CheckCircle2, color: "text-green-500", badge: "default" as const, label: "Completed" },
  FAILED: { icon: XCircle, color: "text-destructive", badge: "destructive" as const, label: "Failed" },
  RUNNING: { icon: Zap, color: "text-yellow-500", badge: "secondary" as const, label: "Running" },
  IDLE: { icon: Clock, color: "text-muted-foreground", badge: "secondary" as const, label: "Idle" },
  PAUSED: { icon: Clock, color: "text-muted-foreground", badge: "secondary" as const, label: "Paused" },
};

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AgentsPage() {
  const [agents, setAgents] = useState<AgentWorkflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQ, setSearchQ] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [runningAgent, setRunningAgent] = useState<AgentWorkflow | null>(null);
  const [activeTab, setActiveTab] = useState<"agents" | "templates" | "runs">("agents");

  useEffect(() => { fetchAgents(); }, []);

  async function fetchAgents() {
    setLoading(true);
    try {
      const res = await fetch("/api/agents/create");
      if (res.ok) {
        const { data } = await res.json();
        setAgents(data);
      }
    } finally {
      setLoading(false);
    }
  }

  async function deleteAgent(id: string) {
    if (!confirm("Delete this agent?")) return;
    await fetch(`/api/agents/create?id=${id}`, { method: "DELETE" });
    setAgents((prev) => prev.filter((a) => a.id !== id));
    sileo.success({ title: "Agent deleted" });
  }

  const filtered = agents.filter(
    (a) =>
      a.name.toLowerCase().includes(searchQ.toLowerCase()) ||
      (a.description ?? "").toLowerCase().includes(searchQ.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b bg-background">
        <div>
          <h1 className="text-2xl font-bold">AI Agents</h1>
          <p className="text-sm text-muted-foreground">
            Build, configure, and run autonomous AI agents
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Agent
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-6 py-3 border-b bg-muted/20">
        {(["agents", "templates", "runs"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "px-4 py-1.5 rounded-md text-sm font-medium transition-colors capitalize",
              activeTab === tab
                ? "bg-background border shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab}
            {tab === "agents" && agents.length > 0 && (
              <span className="ml-1.5 text-xs bg-primary text-primary-foreground rounded-full px-1.5 py-0.5">
                {agents.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === "agents" && (
          <AgentsTab
            agents={filtered}
            loading={loading}
            searchQ={searchQ}
            setSearchQ={setSearchQ}
            onDelete={deleteAgent}
            onRun={setRunningAgent}
            onRefresh={fetchAgents}
            onNew={() => setShowCreate(true)}
          />
        )}
        {activeTab === "templates" && (
          <TemplatesTab
            onUseTemplate={(tpl) => {
              setShowCreate(true);
            }}
          />
        )}
        {activeTab === "runs" && <RunsTab />}
      </div>

      {/* Create Agent Dialog */}
      <CreateAgentDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={(agent) => {
          setAgents((prev) => [agent, ...prev]);
          setActiveTab("agents");
          sileo.success({ title: "Agent created!" });
        }}
      />

      {/* Run Agent Dialog */}
      {runningAgent && (
        <RunAgentDialog
          agent={runningAgent}
          onClose={() => setRunningAgent(null)}
        />
      )}
    </div>
  );
}

// ─── Agents Tab ───────────────────────────────────────────────────────────────

function AgentsTab({
  agents, loading, searchQ, setSearchQ, onDelete, onRun, onRefresh, onNew,
}: {
  agents: AgentWorkflow[];
  loading: boolean;
  searchQ: string;
  setSearchQ: (q: string) => void;
  onDelete: (id: string) => void;
  onRun: (agent: AgentWorkflow) => void;
  onRefresh: () => void;
  onNew: () => void;
}) {
  return (
    <div className="space-y-4 max-w-5xl">
      {/* Search + refresh */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            placeholder="Search agents…"
            className="pl-8 pr-3 py-2 text-sm rounded-md border bg-background outline-none focus:ring-1 focus:ring-ring w-full"
          />
        </div>
        <Button variant="ghost" size="icon" onClick={onRefresh} title="Refresh">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : agents.length === 0 ? (
        <EmptyAgents onNew={onNew} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {agents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} onDelete={onDelete} onRun={onRun} />
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyAgents({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center border rounded-xl bg-muted/20">
      <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center text-3xl mb-4">
        🤖
      </div>
      <h3 className="text-lg font-semibold mb-2">No agents yet</h3>
      <p className="text-muted-foreground text-sm mb-6 max-w-sm">
        Create your first AI agent with custom tools, system prompts, and model configuration.
      </p>
      <div className="flex gap-3">
        <Button onClick={onNew}>
          <Plus className="h-4 w-4 mr-2" />
          Create Agent
        </Button>
        <Button variant="outline" asChild>
          <Link href="/agents?tab=templates">Browse Templates</Link>
        </Button>
      </div>
    </div>
  );
}

function AgentCard({
  agent, onDelete, onRun,
}: {
  agent: AgentWorkflow;
  onDelete: (id: string) => void;
  onRun: (agent: AgentWorkflow) => void;
}) {
  const lastRun = agent.runs[0];
  const lastStatus = lastRun ? STATUS_MAP[lastRun.status as keyof typeof STATUS_MAP] ?? STATUS_MAP.IDLE : null;

  return (
    <div className="rounded-xl border bg-card p-5 hover:shadow-sm transition-shadow flex flex-col gap-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Bot className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold leading-tight">{agent.name}</h3>
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
              {agent.description ?? "No description"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Badge variant={agent.status === "ACTIVE" ? "default" : "secondary"} className="text-xs">
            {agent.status}
          </Badge>
        </div>
      </div>

      {/* Model + Tools */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="px-2 py-0.5 rounded-full bg-muted font-mono">
            {agent.definition?.model ?? "gpt-4o-mini"}
          </span>
          <span>·</span>
          <span>{agent._count.runs} runs</span>
          {lastStatus && (
            <>
              <span>·</span>
              <lastStatus.icon className={cn("h-3 w-3", lastStatus.color)} />
              <span>{lastStatus.label}</span>
            </>
          )}
        </div>
        {agent.enabledTools.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {agent.enabledTools.map((tool) => {
              const T = TOOLS.find((t) => t.id === tool);
              const Icon = T?.icon ?? Bot;
              return (
                <span
                  key={tool}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-muted border"
                >
                  <Icon className="h-3 w-3" />
                  {T?.label ?? tool}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1 border-t">
        <Button
          size="sm"
          className="flex-1"
          onClick={() => onRun(agent)}
        >
          <Play className="h-3.5 w-3.5 mr-1.5" />
          Run
        </Button>
        <Button size="sm" variant="outline" className="flex-1">
          <PenLine className="h-3.5 w-3.5 mr-1.5" />
          Edit
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="text-destructive hover:text-destructive hover:bg-destructive/10"
          onClick={() => onDelete(agent.id)}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ─── Templates Tab ────────────────────────────────────────────────────────────

function TemplatesTab({ onUseTemplate }: { onUseTemplate: (tpl: typeof TEMPLATES[0]) => void }) {
  return (
    <div className="max-w-5xl space-y-4">
      <p className="text-sm text-muted-foreground">
        Start with a pre-configured agent template. Each template has curated tools and a system prompt optimized for its task.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {TEMPLATES.map((tpl) => (
          <div
            key={tpl.name}
            className="rounded-xl border bg-card p-5 flex flex-col gap-4 hover:shadow-sm transition-shadow"
          >
            <div className="flex items-start gap-3">
              <span className="text-3xl flex-shrink-0">{tpl.icon}</span>
              <div className="flex-1">
                <h3 className="font-semibold">{tpl.name}</h3>
                <p className="text-sm text-muted-foreground mt-0.5">{tpl.description}</p>
              </div>
            </div>

            {/* System prompt preview */}
            <div className="rounded-lg bg-muted p-3 text-xs text-muted-foreground font-mono line-clamp-2">
              {tpl.systemPrompt}
            </div>

            {/* Tools */}
            <div className="flex flex-wrap gap-1.5">
              {tpl.tools.map((tool) => {
                const T = TOOLS.find((t) => t.id === tool);
                const Icon = T?.icon ?? Bot;
                return (
                  <span key={tool} className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-muted border">
                    <Icon className="h-3 w-3" />
                    {T?.label ?? tool}
                  </span>
                );
              })}
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-muted border font-mono">
                {tpl.model}
              </span>
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-1 border-t">
              <Button
                size="sm"
                className="flex-1"
                onClick={() => onUseTemplate(tpl)}
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Use Template
              </Button>
              {tpl.href ? (
                <Button size="sm" variant="outline" asChild>
                  <Link href={tpl.href}>
                    <Play className="h-3.5 w-3.5 mr-1.5" />
                    Try it
                  </Link>
                </Button>
              ) : (
                <Button size="sm" variant="outline" disabled>Coming soon</Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Runs Tab ─────────────────────────────────────────────────────────────────

function RunsTab() {
  const [runs, setRuns] = useState<Array<{
    id: string; status: string; createdAt: string; tokensUsed: number;
    input: { message?: string }; workflow?: { name: string } | null;
  }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/agents/runs")
      .then((r) => r.json())
      .then(({ data }) => setRuns(data ?? []))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  if (runs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 border rounded-xl bg-muted/20 text-center">
        <Clock className="h-10 w-10 text-muted-foreground mb-3" />
        <p className="font-medium">No runs yet</p>
        <p className="text-sm text-muted-foreground mt-1">Run an agent to see history here</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl rounded-xl border bg-card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/30 border-b">
          <tr>
            <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Task</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Agent</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Status</th>
            <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground">Tokens</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Started</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {runs.map((run) => {
            const meta = STATUS_MAP[run.status as keyof typeof STATUS_MAP] ?? STATUS_MAP.IDLE;
            const StatusIcon = meta.icon;
            return (
              <tr key={run.id} className="hover:bg-muted/20 transition-colors">
                <td className="px-4 py-3 max-w-[240px]">
                  <p className="truncate text-sm">
                    {run.input?.message ?? "—"}
                  </p>
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {run.workflow?.name ?? "Quick Run"}
                </td>
                <td className="px-4 py-3">
                  <div className={cn("flex items-center gap-1.5 text-xs font-medium", meta.color)}>
                    <StatusIcon className="h-3.5 w-3.5" />
                    {meta.label}
                  </div>
                </td>
                <td className="px-4 py-3 text-right font-mono text-xs">{run.tokensUsed.toLocaleString()}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {new Date(run.createdAt).toLocaleString()}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Create Agent Dialog ──────────────────────────────────────────────────────

function CreateAgentDialog({
  open, onClose, onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (agent: AgentWorkflow) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("You are a helpful AI assistant.");
  const [model, setModel] = useState("gpt-4o-mini");
  const [tools, setTools] = useState<Set<string>>(new Set(["web_search"]));
  const [maxIterations, setMaxIterations] = useState(6);
  const [temperature, setTemperature] = useState(0.7);
  const [saving, setSaving] = useState(false);

  function toggleTool(id: string) {
    setTools((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleCreate() {
    if (!name.trim()) { sileo.error({ title: "Agent name is required" }); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/agents/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name, description, systemPrompt, model,
          tools: Array.from(tools), maxIterations, temperature,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      const { data } = await res.json();
      onCreated(data);
      onClose();
      setName(""); setDescription(""); setTools(new Set(["web_search"]));
    } catch (err) {
      sileo.error({ title: (err as Error).message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create AI Agent</DialogTitle>
          <DialogDescription>
            Configure a reusable autonomous agent with custom tools and behavior.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Basic info */}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="name">Agent Name *</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Research Assistant" />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="desc">Description</Label>
              <Input id="desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does this agent do?" />
            </div>
          </div>

          {/* System prompt */}
          <div className="space-y-1.5">
            <Label htmlFor="prompt">System Prompt</Label>
            <Textarea
              id="prompt"
              rows={4}
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="Define the agent's behavior, tone, and expertise…"
            />
          </div>

          {/* Model + iterations */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Model</Label>
              <Select value={model} onValueChange={setModel}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MODELS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between">
                <Label>Max Iterations</Label>
                <span className="text-xs font-mono text-muted-foreground">{maxIterations}</span>
              </div>
              <input type="range" min={1} max={15} value={maxIterations}
                onChange={(e) => setMaxIterations(parseInt(e.target.value))}
                className="w-full accent-primary mt-3"
              />
            </div>
          </div>

          {/* Temperature */}
          <div className="space-y-1.5">
            <div className="flex justify-between">
              <Label>Temperature</Label>
              <span className="text-xs font-mono text-muted-foreground">{temperature}</span>
            </div>
            <input type="range" min={0} max={2} step={0.1} value={temperature}
              onChange={(e) => setTemperature(parseFloat(e.target.value))}
              className="w-full accent-primary"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Precise & focused</span><span>Creative & diverse</span>
            </div>
          </div>

          {/* Tools */}
          <div className="space-y-2">
            <Label>Enabled Tools</Label>
            <div className="grid grid-cols-1 gap-2">
              {TOOLS.map((tool) => {
                const Icon = tool.icon;
                const selected = tools.has(tool.id);
                return (
                  <button
                    key={tool.id}
                    type="button"
                    onClick={() => toggleTool(tool.id)}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-lg border text-left transition-all",
                      selected
                        ? "border-primary bg-primary/5 text-foreground"
                        : "border-border bg-background text-muted-foreground hover:border-primary/40"
                    )}
                  >
                    <div className={cn("h-8 w-8 rounded-md flex items-center justify-center flex-shrink-0",
                      selected ? "bg-primary/10" : "bg-muted")}>
                      <Icon className={cn("h-4 w-4", selected ? "text-primary" : "text-muted-foreground")} />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{tool.label}</p>
                      <p className="text-xs text-muted-foreground">{tool.description}</p>
                    </div>
                    <div className={cn("ml-auto h-4 w-4 rounded-full border-2 flex-shrink-0",
                      selected ? "border-primary bg-primary" : "border-muted-foreground"
                    )}>
                      {selected && <Check className="h-3 w-3 text-primary-foreground m-auto" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleCreate} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Create Agent
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Run Agent Dialog ──────────────────────────────────────────────────────────

function RunAgentDialog({ agent, onClose }: { agent: AgentWorkflow; onClose: () => void }) {
  const [input, setInput] = useState("");
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [result, setResult] = useState("");
  const [running, setRunning] = useState(false);
  const [copied, setCopied] = useState(false);
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());

  function toggleStep(id: string) {
    setExpandedSteps((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  async function run() {
    if (!input.trim() || running) return;
    setRunning(true); setSteps([]); setResult("");

    const addStep = (s: Omit<AgentStep, "id" | "timestamp">) => {
      const id = Math.random().toString(36).slice(2);
      setSteps((p) => [...p, { ...s, id, timestamp: new Date().toLocaleTimeString() }]);
      return id;
    };

    try {
      const res = await fetch("/api/agents/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input,
          tools: agent.enabledTools,
          model: agent.definition?.model ?? "gpt-4o-mini",
          maxIterations: agent.definition?.maxIterations ?? 6,
        }),
      });

      if (!res.ok || !res.body) throw new Error("Agent API failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of decoder.decode(value).split("\n").filter(Boolean)) {
          if (line === "data: [DONE]") break;
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === "step") addStep({ ...data.step, status: "done" });
              else if (data.type === "result") setResult(data.content);
              else if (data.type === "error") sileo.error({ title: data.message });
            } catch {}
          }
        }
      }
    } catch {
      sileo.error({ title: "Agent run failed. Make sure your OpenAI API key is configured." });
    } finally {
      setRunning(false);
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            {agent.name}
          </DialogTitle>
          <DialogDescription>{agent.description ?? "Run this agent on a task"}</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-2">
          {/* Input */}
          <div className="space-y-1.5">
            <Label>Task</Label>
            <Textarea
              rows={3}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Describe the task for the agent…"
              disabled={running}
            />
          </div>

          {/* Steps */}
          {steps.filter(s => s.type !== "response").map((step) => {
            const ToolIcon = step.type === "tool_call" || step.type === "tool_result"
              ? (TOOLS.find(t => t.id === step.toolName)?.icon ?? Bot)
              : Bot;
            const expanded = expandedSteps.has(step.id);
            return (
              <div key={step.id} className={cn("rounded-lg border text-xs overflow-hidden",
                step.type === "tool_call" ? "border-blue-200 bg-blue-50/40 dark:border-blue-900/40 dark:bg-blue-950/20"
                : step.type === "tool_result" ? "border-green-200 bg-green-50/40 dark:border-green-900/40 dark:bg-green-950/20"
                : "border-violet-200 bg-violet-50/40 dark:border-violet-900/40 dark:bg-violet-950/20"
              )}>
                <button onClick={() => toggleStep(step.id)} className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-black/5 dark:hover:bg-white/5">
                  <ToolIcon className={cn("h-3.5 w-3.5 flex-shrink-0",
                    step.type === "tool_call" ? "text-blue-500"
                    : step.type === "tool_result" ? "text-green-500"
                    : "text-violet-500"
                  )} />
                  <span className="flex-1 font-medium">
                    {step.type === "tool_call" ? `Calling ${step.toolName}`
                    : step.type === "tool_result" ? `${step.toolName} result`
                    : "Reasoning"}
                  </span>
                  <span className="text-muted-foreground">{step.timestamp}</span>
                  {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </button>
                {expanded && (
                  <div className="px-3 pb-2.5 border-t">
                    <pre className="mt-2 text-[11px] font-mono text-muted-foreground whitespace-pre-wrap max-h-32 overflow-y-auto">{step.content}</pre>
                  </div>
                )}
              </div>
            );
          })}

          {running && steps.length === 0 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Agent initializing…
            </div>
          )}

          {/* Result */}
          {result && (
            <div className="rounded-xl border bg-card p-4">
              <div className="flex items-center justify-between mb-2 pb-2 border-b">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  Result
                </div>
                <button onClick={async () => { await navigator.clipboard.writeText(result); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                  className="p-1 rounded hover:bg-muted text-muted-foreground">
                  {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
              <pre className="text-sm whitespace-pre-wrap leading-relaxed">{result}</pre>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={run} disabled={running || !input.trim()}>
            {running ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Running…</> : <><Play className="h-4 w-4 mr-2" />Run Agent</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
