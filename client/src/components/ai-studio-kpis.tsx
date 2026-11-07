import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Loader2,
  MessageSquareX,
  ShieldCheck,
  TrendingDown,
  Users,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface KpiStepCount {
  stepId: string;
  count: number;
}

interface KpiReasonCount {
  reason: string;
  count: number;
}

interface KpiMetrics {
  totalConversations: number;
  totalAiTurns: number;
  containmentRate: number;
  fallbackRate: number;
  dropOffSteps: KpiStepCount[];
  topRejectedInputs: KpiReasonCount[];
}

function pct(rate: number): string {
  return `${(rate * 100).toFixed(0)}%`;
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Users;
  label: string;
  value: string;
  tone: "default" | "green" | "red" | "amber";
}) {
  const toneClass =
    tone === "green"
      ? "text-green-500"
      : tone === "red"
        ? "text-red-500"
        : tone === "amber"
          ? "text-amber-500"
          : "";
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <Icon className={`h-8 w-8 ${toneClass || "text-muted-foreground"}`} />
        <div className="min-w-0">
          <div className="text-2xl font-semibold">{value}</div>
          <div className="truncate text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

export function KpisTab({ workflowId }: { workflowId: string }) {
  const [days, setDays] = useState<number>(30);

  const { data: metrics, isLoading } = useQuery<KpiMetrics>({
    queryKey: [`/api/ai-studio/kpis?workflowId=${workflowId}&days=${days}`],
    enabled: Boolean(workflowId),
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Computing KPIs…
      </div>
    );
  }

  if (!metrics || metrics.totalAiTurns === 0) {
    return (
      <div className="space-y-4">
        <div className="flex justify-end">
          <TimeWindowSelect value={days} onChange={setDays} />
        </div>
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            No AI conversations yet for this workflow. Run some live chats and check back.
          </CardContent>
        </Card>
      </div>
    );
  }

  const containmentTone =
    metrics.containmentRate >= 0.7 ? "green" : metrics.containmentRate >= 0.4 ? "amber" : "red";
  const fallbackTone =
    metrics.fallbackRate <= 0.15 ? "green" : metrics.fallbackRate <= 0.3 ? "amber" : "red";

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <TimeWindowSelect value={days} onChange={setDays} />
      </div>

      {/* Top row: stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={Users} label="Total Conversations" value={String(metrics.totalConversations)} tone="default" />
        <StatCard icon={ShieldCheck} label="Containment Rate" value={pct(metrics.containmentRate)} tone={containmentTone} />
        <StatCard icon={AlertTriangle} label="Fallback Rate" value={pct(metrics.fallbackRate)} tone={fallbackTone} />
        <StatCard icon={MessageSquareX} label="Total AI Turns" value={String(metrics.totalAiTurns)} tone="default" />
      </div>

      {/* Middle + bottom rows */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Drop-off steps */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <TrendingDown className="h-4 w-4 text-muted-foreground" />
              Drop-off Steps
            </CardTitle>
            <CardDescription>Where conversations end without completing.</CardDescription>
          </CardHeader>
          <CardContent>
            {metrics.dropOffSteps.length === 0 ? (
              <p className="text-sm text-muted-foreground">No drop-offs recorded.</p>
            ) : (
              <ul className="space-y-2">
                {metrics.dropOffSteps.map((s) => (
                  <li key={s.stepId} className="flex items-center justify-between text-sm">
                    <span className="font-mono">{s.stepId}</span>
                    <span className="text-muted-foreground">{s.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Top rejected inputs */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
              Top Rejected Inputs
            </CardTitle>
            <CardDescription>What users typed that failed validation.</CardDescription>
          </CardHeader>
          <CardContent>
            {metrics.topRejectedInputs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No rejections recorded.</p>
            ) : (
              <ul className="space-y-2">
                {metrics.topRejectedInputs.map((r) => (
                  <li key={r.reason} className="flex items-start justify-between gap-3 text-sm">
                    <span className="break-words text-muted-foreground">{r.reason}</span>
                    <span className="shrink-0 font-medium">{r.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function TimeWindowSelect({
  value,
  onChange,
}: {
  value: number;
  onChange: (days: number) => void;
}) {
  return (
    <Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
      <SelectTrigger className="w-[160px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="7">Last 7 days</SelectItem>
        <SelectItem value="30">Last 30 days</SelectItem>
        <SelectItem value="0">All time</SelectItem>
      </SelectContent>
    </Select>
  );
}
