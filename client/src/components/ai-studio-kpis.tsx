import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  BarChart3,
  HelpCircle,
  Loader2,
  MessageSquareX,
  ShieldCheck,
  TrendingDown,
  Users,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
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

interface KpiTimePoint {
  date: string;
  conversations: number;
}

interface KpiUnansweredMessage {
  message: string;
  count: number;
}

interface KpiMetrics {
  totalConversations: number;
  totalAiTurns: number;
  containmentRate: number;
  fallbackRate: number;
  dropOffSteps: KpiStepCount[];
  topRejectedInputs: KpiReasonCount[];
  slotDistribution: Record<string, Record<string, number>>;
  stepFunnel: KpiStepCount[];
  timeSeries: KpiTimePoint[];
  unansweredQuestions: number;
  topUnansweredMessages: KpiUnansweredMessage[];
}

const tooltipStyle = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 8,
  color: "hsl(var(--foreground))",
  fontSize: 12,
};

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

/** Horizontal bar chart shared by the funnel and slot-distribution views. */
function HBarChart({ data }: { data: Array<{ name: string; count: number }> }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(120, data.length * 32)}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
        <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
        <YAxis
          type="category"
          dataKey="name"
          width={110}
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
        />
        <Tooltip cursor={{ fill: "hsl(var(--muted))" }} contentStyle={tooltipStyle} />
        <Bar dataKey="count" fill="#6366f1" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function KpisTab({ workflowId }: { workflowId: string }) {
  const [days, setDays] = useState<number>(30);

  const { data: metrics, isLoading } = useQuery<KpiMetrics>({
    queryKey: [`/api/ai-studio/kpis?workflowId=${workflowId}&days=${days}`],
    enabled: Boolean(workflowId),
  });

  const slotNames = useMemo(() => Object.keys(metrics?.slotDistribution ?? {}), [metrics]);
  const [selectedSlot, setSelectedSlot] = useState<string>("");

  // Keep the selected slot valid when the data changes.
  const effectiveSlot = slotNames.includes(selectedSlot) ? selectedSlot : (slotNames[0] ?? "");

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

  const funnelData = metrics.stepFunnel.map((s) => ({ name: s.stepId, count: s.count }));
  const slotData = effectiveSlot
    ? Object.entries(metrics.slotDistribution[effectiveSlot] ?? {}).map(([value, count]) => ({
        name: value,
        count,
      }))
    : [];
  const timeData = metrics.timeSeries.map((t) => ({ name: t.date, count: t.conversations }));

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <TimeWindowSelect value={days} onChange={setDays} />
      </div>

      {/* Top row: stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard icon={Users} label="Total Conversations" value={String(metrics.totalConversations)} tone="default" />
        <StatCard icon={ShieldCheck} label="Containment Rate" value={pct(metrics.containmentRate)} tone={containmentTone} />
        <StatCard icon={AlertTriangle} label="Fallback Rate" value={pct(metrics.fallbackRate)} tone={fallbackTone} />
        <StatCard icon={MessageSquareX} label="Total AI Turns" value={String(metrics.totalAiTurns)} tone="default" />
        <StatCard icon={HelpCircle} label="Unanswered Questions" value={String(metrics.unansweredQuestions)} tone="default" />
      </div>

      {/* Funnel */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
            Step Funnel
          </CardTitle>
          <CardDescription>How many conversations reached each step.</CardDescription>
        </CardHeader>
        <CardContent>
          {funnelData.length === 0 ? (
            <p className="text-sm text-muted-foreground">No step data recorded.</p>
          ) : (
            <HBarChart data={funnelData} />
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Slot distribution */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              Slot Distribution
            </CardTitle>
            <CardDescription>Which values customers chose, per slot.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {slotNames.length === 0 ? (
              <p className="text-sm text-muted-foreground">No slots recorded.</p>
            ) : (
              <>
                <Select value={effectiveSlot} onValueChange={setSelectedSlot}>
                  <SelectTrigger className="w-full max-w-xs">
                    <SelectValue placeholder="Select a slot" />
                  </SelectTrigger>
                  <SelectContent>
                    {slotNames.map((slot) => (
                      <SelectItem key={slot} value={slot}>
                        {slot}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <HBarChart data={slotData} />
              </>
            )}
          </CardContent>
        </Card>

        {/* Drop-off + rejected inputs */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <MessageSquareX className="h-4 w-4 text-muted-foreground" />
              Drop-off Steps
            </CardTitle>
            <CardDescription>Where conversations end without completing.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
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

            <div className="border-t pt-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                Top Rejected Inputs
              </div>
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
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top unanswered questions */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <HelpCircle className="h-4 w-4 text-muted-foreground" />
            Top Unanswered Questions
          </CardTitle>
          <CardDescription>What customers asked that the AI could not answer from the sheet.</CardDescription>
        </CardHeader>
        <CardContent>
          {metrics.topUnansweredMessages.length === 0 ? (
            <p className="text-sm text-muted-foreground">No unanswered questions recorded.</p>
          ) : (
            <ul className="space-y-2">
              {metrics.topUnansweredMessages.map((m) => (
                <li key={m.message} className="flex items-start justify-between gap-3 text-sm">
                  <span className="break-words text-muted-foreground">{m.message}</span>
                  <span className="shrink-0 font-medium">{m.count}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Time series */}
      {timeData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              Conversations per Day
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={timeData} margin={{ left: 8, right: 8, top: 4, bottom: 4 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip cursor={{ fill: "hsl(var(--muted))" }} contentStyle={tooltipStyle} />
                <Bar dataKey="count" name="Conversations" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
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
