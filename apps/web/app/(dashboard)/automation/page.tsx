"use client";

import { useState } from "react";
import {
  Zap, Plus, Play, Pause, Trash2, Clock, Globe, Mail,
  MessageSquare, FileText, Bell, GitBranch, Settings2,
  CheckCircle2, ChevronRight, Loader2, ToggleLeft, ToggleRight,
  RefreshCw, Webhook, Bot,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { sileo } from "sileo";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Automation {
  id: string;
  name: string;
  description: string;
  trigger: string;
  triggerConfig: string;
  action: string;
  actionConfig: string;
  enabled: boolean;
  runCount: number;
  lastRun: string | null;
}

// ─── Pre-built templates ──────────────────────────────────────────────────────

const AUTOMATION_TEMPLATES = [
  {
    icon: "📅",
    name: "Daily AI Briefing",
    description: "Every morning at 9 AM, generate a summary of your top priorities for the day",
    trigger: "schedule",
    triggerConfig: "0 9 * * *",
    action: "ai_generate",
    actionConfig: "Generate a daily briefing summarising my top 5 priorities. Be concise and actionable.",
    category: "Productivity",
  },
  {
    icon: "📄",
    name: "File → Knowledge Base",
    description: "When a new file is uploaded, automatically chunk and embed it into the knowledge base",
    trigger: "file_upload",
    triggerConfig: "*.pdf,*.docx,*.txt",
    action: "rag_index",
    actionConfig: "chunk_size=512,overlap=64,model=text-embedding-3-small",
    category: "Knowledge",
  },
  {
    icon: "🔔",
    name: "AI Usage Alert",
    description: "Send an email alert when token usage reaches 80% of the monthly limit",
    trigger: "threshold",
    triggerConfig: "tokens_used >= 0.8 * tokens_limit",
    action: "send_email",
    actionConfig: "Subject: Usage Alert — 80% tokens used",
    category: "Monitoring",
  },
  {
    icon: "📊",
    name: "Weekly Analytics Report",
    description: "Every Monday, generate and email an AI-written analytics summary",
    trigger: "schedule",
    triggerConfig: "0 8 * * 1",
    action: "ai_generate",
    actionConfig: "Write a weekly analytics summary: total users, messages, top models, revenue. Format as an executive briefing.",
    category: "Reporting",
  },
  {
    icon: "🤖",
    name: "Webhook → Agent",
    description: "When your webhook receives a POST request, trigger an AI agent run",
    trigger: "webhook",
    triggerConfig: "POST /webhooks/agent-trigger",
    action: "run_agent",
    actionConfig: "Use the request body as the agent task input",
    category: "Integration",
  },
  {
    icon: "💬",
    name: "New User Welcome",
    description: "When a user registers, send a personalized AI-written welcome email",
    trigger: "user_signup",
    triggerConfig: "on_register",
    action: "send_email",
    actionConfig: "Generate a warm, personalized welcome email for: {user.name}",
    category: "Onboarding",
  },
];

const TRIGGERS = [
  { value: "schedule", label: "⏰ Schedule (Cron)", icon: Clock },
  { value: "webhook", label: "🔗 Webhook", icon: Webhook },
  { value: "file_upload", label: "📁 File Upload", icon: FileText },
  { value: "user_signup", label: "👤 New User Signup", icon: CheckCircle2 },
  { value: "threshold", label: "📈 Usage Threshold", icon: Bell },
  { value: "api_call", label: "⚡ API Call", icon: Globe },
];

const ACTIONS = [
  { value: "ai_generate", label: "🤖 AI Content Generation", icon: Bot },
  { value: "run_agent", label: "🦾 Run AI Agent", icon: Zap },
  { value: "send_email", label: "📧 Send Email", icon: Mail },
  { value: "rag_index", label: "🗄️ Index to Knowledge Base", icon: FileText },
  { value: "webhook_call", label: "🔗 Call Webhook", icon: Globe },
  { value: "slack_notify", label: "💬 Slack Notification", icon: MessageSquare },
];

const CRON_PRESETS = [
  { label: "Every minute", value: "* * * * *" },
  { label: "Every hour", value: "0 * * * *" },
  { label: "Daily at 9 AM", value: "0 9 * * *" },
  { label: "Weekly Monday 8 AM", value: "0 8 * * 1" },
  { label: "Monthly 1st", value: "0 9 1 * *" },
];

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AutomationPage() {
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [activeTab, setActiveTab] = useState<"workflows" | "templates" | "logs">("workflows");
  const [templateFilter, setTemplateFilter] = useState("All");

  const categories = ["All", ...Array.from(new Set(AUTOMATION_TEMPLATES.map((t) => t.category)))];

  function toggleEnabled(id: string) {
    setAutomations((prev) =>
      prev.map((a) => (a.id === id ? { ...a, enabled: !a.enabled } : a))
    );
    sileo.success({ title: "Automation updated" });
  }

  function deleteAutomation(id: string) {
    if (!confirm("Delete this automation?")) return;
    setAutomations((prev) => prev.filter((a) => a.id !== id));
    sileo.success({ title: "Automation deleted" });
  }

  function addFromTemplate(tpl: typeof AUTOMATION_TEMPLATES[0]) {
    const newAuto: Automation = {
      id: Math.random().toString(36).slice(2),
      name: tpl.name,
      description: tpl.description,
      trigger: tpl.trigger,
      triggerConfig: tpl.triggerConfig,
      action: tpl.action,
      actionConfig: tpl.actionConfig,
      enabled: false,
      runCount: 0,
      lastRun: null,
    };
    setAutomations((prev) => [newAuto, ...prev]);
    setActiveTab("workflows");
    sileo.success({ title: `"${tpl.name}" added — click enable to activate` });
  }

  const filteredTemplates = AUTOMATION_TEMPLATES.filter(
    (t) => templateFilter === "All" || t.category === templateFilter
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b bg-background">
        <div>
          <h1 className="text-2xl font-bold">Automation</h1>
          <p className="text-sm text-muted-foreground">
            Trigger AI workflows automatically based on schedules, events, or webhooks
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Automation
        </Button>
      </div>

      {/* Stats bar */}
      <div className="flex items-center gap-6 px-6 py-3 border-b bg-muted/10 text-sm">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-green-500" />
          <span className="text-muted-foreground">Active:</span>
          <span className="font-medium">{automations.filter((a) => a.enabled).length}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-muted-foreground" />
          <span className="text-muted-foreground">Paused:</span>
          <span className="font-medium">{automations.filter((a) => !a.enabled).length}</span>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-muted-foreground text-xs">Total runs: {automations.reduce((s, a) => s + a.runCount, 0)}</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-6 py-3 border-b">
        {(["workflows", "templates", "logs"] as const).map((tab) => (
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
            {tab === "workflows" && automations.length > 0 && (
              <span className="ml-1.5 text-xs bg-primary text-primary-foreground rounded-full px-1.5 py-0.5">
                {automations.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === "workflows" && (
          <div className="max-w-4xl space-y-4">
            {automations.length === 0 ? (
              <EmptyWorkflows onNew={() => setShowCreate(true)} onBrowse={() => setActiveTab("templates")} />
            ) : (
              automations.map((auto) => (
                <AutomationCard
                  key={auto.id}
                  automation={auto}
                  onToggle={() => toggleEnabled(auto.id)}
                  onDelete={() => deleteAutomation(auto.id)}
                />
              ))
            )}
          </div>
        )}

        {activeTab === "templates" && (
          <div className="max-w-5xl space-y-5">
            {/* Category filter */}
            <div className="flex gap-2 flex-wrap">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setTemplateFilter(cat)}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                    templateFilter === cat
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground hover:text-foreground"
                  )}
                >
                  {cat}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredTemplates.map((tpl) => (
                <TemplateCard key={tpl.name} template={tpl} onUse={() => addFromTemplate(tpl)} />
              ))}
            </div>
          </div>
        )}

        {activeTab === "logs" && <LogsPlaceholder />}
      </div>

      {/* Create Dialog */}
      <CreateAutomationDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={(auto) => {
          setAutomations((prev) => [auto, ...prev]);
          setActiveTab("workflows");
          sileo.success({ title: "Automation created!" });
        }}
      />
    </div>
  );
}

// ─── Components ───────────────────────────────────────────────────────────────

function EmptyWorkflows({ onNew, onBrowse }: { onNew: () => void; onBrowse: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 border rounded-xl bg-muted/10 text-center">
      <div className="text-5xl mb-4">⚡</div>
      <h3 className="text-lg font-semibold mb-2">No automations yet</h3>
      <p className="text-sm text-muted-foreground mb-6 max-w-sm">
        Create your first automation to trigger AI workflows based on schedules, webhooks, or events.
      </p>
      <div className="flex gap-3">
        <Button onClick={onNew}><Plus className="h-4 w-4 mr-2" />Create Automation</Button>
        <Button variant="outline" onClick={onBrowse}>Browse Templates</Button>
      </div>
    </div>
  );
}

function AutomationCard({
  automation, onToggle, onDelete,
}: {
  automation: Automation;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const triggerMeta = TRIGGERS.find((t) => t.value === automation.trigger);
  const actionMeta = ACTIONS.find((a) => a.value === automation.action);

  return (
    <div className={cn(
      "rounded-xl border bg-card p-5 transition-shadow hover:shadow-sm",
      !automation.enabled && "opacity-70"
    )}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold">{automation.name}</h3>
            <Badge variant={automation.enabled ? "default" : "secondary"} className="text-xs">
              {automation.enabled ? "Active" : "Paused"}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">{automation.description}</p>
        </div>

        {/* Toggle */}
        <button onClick={onToggle} className="flex-shrink-0 mt-1">
          {automation.enabled
            ? <ToggleRight className="h-6 w-6 text-primary" />
            : <ToggleLeft className="h-6 w-6 text-muted-foreground" />}
        </button>
      </div>

      {/* Trigger → Action flow */}
      <div className="flex items-center gap-2 mt-4 text-xs">
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted border">
          <span>{triggerMeta?.label ?? automation.trigger}</span>
        </div>
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/5 border border-primary/20 text-primary">
          <span>{actionMeta?.label ?? automation.action}</span>
        </div>
        <div className="ml-auto flex items-center gap-4 text-muted-foreground">
          <span>{automation.runCount} runs</span>
          {automation.lastRun && <span>Last: {automation.lastRun}</span>}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 mt-4 pt-3 border-t">
        <Button size="sm" variant="outline" onClick={onToggle}>
          {automation.enabled ? <><Pause className="h-3.5 w-3.5 mr-1.5" />Pause</> : <><Play className="h-3.5 w-3.5 mr-1.5" />Enable</>}
        </Button>
        <Button size="sm" variant="ghost">
          <Settings2 className="h-3.5 w-3.5 mr-1.5" />Edit
        </Button>
        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive ml-auto" onClick={onDelete}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

function TemplateCard({ template, onUse }: { template: typeof AUTOMATION_TEMPLATES[0]; onUse: () => void }) {
  const triggerMeta = TRIGGERS.find((t) => t.value === template.trigger);
  const actionMeta = ACTIONS.find((a) => a.value === template.action);

  return (
    <div className="rounded-xl border bg-card p-5 hover:shadow-sm transition-shadow flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <span className="text-2xl flex-shrink-0">{template.icon}</span>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold">{template.name}</h3>
            <Badge variant="secondary" className="text-xs">{template.category}</Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">{template.description}</p>
        </div>
      </div>

      {/* Flow */}
      <div className="flex items-center gap-2 text-xs">
        <div className="px-3 py-1.5 rounded-lg bg-muted border truncate max-w-[45%]">
          {triggerMeta?.label ?? template.trigger}
        </div>
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
        <div className="px-3 py-1.5 rounded-lg bg-primary/5 border border-primary/20 text-primary truncate max-w-[45%]">
          {actionMeta?.label ?? template.action}
        </div>
      </div>

      <Button size="sm" className="w-full" onClick={onUse}>
        <Plus className="h-3.5 w-3.5 mr-1.5" />
        Add to Workflows
      </Button>
    </div>
  );
}

function LogsPlaceholder() {
  return (
    <div className="max-w-4xl rounded-xl border bg-card overflow-hidden">
      <div className="p-4 border-b flex items-center justify-between">
        <h2 className="font-semibold">Execution Logs</h2>
        <Button variant="ghost" size="sm"><RefreshCw className="h-4 w-4" /></Button>
      </div>
      <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
        <Clock className="h-8 w-8 mb-3" />
        <p className="font-medium text-foreground">No logs yet</p>
        <p className="text-sm mt-1">Automation execution history will appear here</p>
      </div>
    </div>
  );
}

// ─── Create Automation Dialog ─────────────────────────────────────────────────

function CreateAutomationDialog({
  open, onClose, onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (auto: Automation) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [trigger, setTrigger] = useState("schedule");
  const [triggerConfig, setTriggerConfig] = useState("0 9 * * *");
  const [action, setAction] = useState("ai_generate");
  const [actionConfig, setActionConfig] = useState("");
  const [saving, setSaving] = useState(false);

  function handleCreate() {
    if (!name.trim()) { sileo.error({ title: "Name is required" }); return; }
    setSaving(true);
    setTimeout(() => {
      onCreated({
        id: Math.random().toString(36).slice(2),
        name, description, trigger, triggerConfig,
        action, actionConfig, enabled: false, runCount: 0, lastRun: null,
      });
      onClose();
      setName(""); setDescription(""); setActionConfig("");
      setSaving(false);
    }, 600);
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Automation</DialogTitle>
          <DialogDescription>
            Connect a trigger to an AI action to automate your workflows.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="space-y-1.5">
            <Label>Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Daily AI Briefing" />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does this automation do?" />
          </div>

          {/* Trigger */}
          <div className="rounded-lg border p-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Trigger</p>
            <div className="space-y-1.5">
              <Label>When…</Label>
              <Select value={trigger} onValueChange={setTrigger}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TRIGGERS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {trigger === "schedule" && (
              <div className="space-y-2">
                <Label>Cron Expression</Label>
                <Input value={triggerConfig} onChange={(e) => setTriggerConfig(e.target.value)} placeholder="0 9 * * *" className="font-mono" />
                <div className="flex flex-wrap gap-1.5">
                  {CRON_PRESETS.map((p) => (
                    <button key={p.value} onClick={() => setTriggerConfig(p.value)}
                      className="px-2 py-0.5 rounded text-xs border hover:bg-muted transition-colors">
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {trigger === "webhook" && (
              <div className="space-y-1.5">
                <Label>Endpoint Path</Label>
                <Input value={triggerConfig} onChange={(e) => setTriggerConfig(e.target.value)} placeholder="/webhooks/my-trigger" className="font-mono" />
              </div>
            )}

            {trigger === "threshold" && (
              <div className="space-y-1.5">
                <Label>Threshold Condition</Label>
                <Input value={triggerConfig} onChange={(e) => setTriggerConfig(e.target.value)} placeholder="tokens_used >= 0.8 * tokens_limit" />
              </div>
            )}
          </div>

          {/* Action */}
          <div className="rounded-lg border p-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Action</p>
            <div className="space-y-1.5">
              <Label>Then…</Label>
              <Select value={action} onValueChange={setAction}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ACTIONS.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>{action === "ai_generate" ? "AI Prompt" : action === "send_email" ? "Email Subject / Template" : "Configuration"}</Label>
              <Textarea
                rows={3}
                value={actionConfig}
                onChange={(e) => setActionConfig(e.target.value)}
                placeholder={
                  action === "ai_generate" ? "Write a daily briefing summarising my top priorities…"
                  : action === "send_email" ? "Subject: Your weekly report is ready"
                  : action === "webhook_call" ? "https://api.example.com/endpoint"
                  : "Configuration details…"
                }
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleCreate} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Create Automation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
