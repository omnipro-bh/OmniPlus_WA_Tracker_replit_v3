import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Loader2, Plus, Save, Target, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

/** Shown when the workflow has no objectives saved yet. Mirrors the backend default. */
export const DEFAULT_OBJECTIVES = ["Book an appointment", "Capture leads", "Answer FAQs"];

interface AiStudioConfigResponse {
  instructions?: string;
  persona?: { alias: string; title: string; description: string };
  objectives?: string[];
}

export function AiStudioObjectives({ workflowId }: { workflowId: string }) {
  const { toast } = useToast();
  const queryKey = [`/api/ai-studio/config?workflowId=${workflowId}`];

  const { data, isLoading } = useQuery<AiStudioConfigResponse>({
    queryKey,
    enabled: Boolean(workflowId),
  });

  // No workflow yet means the workflows list is still loading — treat that as
  // loading rather than flashing the defaults as if they were the saved config.
  const loading = isLoading || !workflowId;

  const [objectives, setObjectives] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);

  // Reset the editor immediately on workflow change so a save can never write the
  // previous workflow's objectives into the newly selected one.
  useEffect(() => {
    setObjectives([]);
    setDirty(false);
  }, [workflowId]);

  useEffect(() => {
    if (loading || dirty) return;
    const fromServer = data?.objectives;
    setObjectives(
      Array.isArray(fromServer) && fromServer.length > 0 ? [...fromServer] : [...DEFAULT_OBJECTIVES],
    );
  }, [data, loading, dirty]);

  const update = (next: string[]) => {
    setObjectives(next);
    setDirty(true);
  };

  const addObjective = () => update([...objectives, ""]);

  const removeObjective = (index: number) =>
    update(objectives.filter((_, i) => i !== index));

  const moveObjective = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= objectives.length) return;
    const next = [...objectives];
    [next[index], next[target]] = [next[target], next[index]];
    update(next);
  };

  const setObjective = (index: number, value: string) =>
    update(objectives.map((o, i) => (i === index ? value : o)));

  const save = useMutation({
    mutationFn: async (next: string[]) => {
      await apiRequest("PUT", "/api/ai-studio/config", {
        workflowId: Number(workflowId),
        objectives: next.map((o) => o.trim()).filter((o) => o.length > 0),
      });
    },
    onSuccess: () => {
      setDirty(false);
      queryClient.invalidateQueries({ queryKey });
      toast({ title: "Saved", description: "Objectives updated." });
    },
    onError: (error: any) => {
      toast({
        title: "Save failed",
        description: error?.message || "Something went wrong.",
        variant: "destructive",
      });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="h-4 w-4" />
          Objectives
        </CardTitle>
        <CardDescription>
          What the AI Agent should achieve, in priority order. When no intent matches, the
          agent reasons step by step and works down this list. Put your most important
          objective first.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading objectives…
          </div>
        ) : objectives.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No objectives yet. Add one so the agent knows what to aim for.
          </p>
        ) : (
          <ol className="space-y-2">
            {objectives.map((objective, index) => (
              <li key={index} className="flex items-center gap-2">
                <span className="w-6 shrink-0 text-center text-xs font-medium text-muted-foreground">
                  {index + 1}
                </span>
                <Input
                  value={objective}
                  onChange={(e) => setObjective(index, e.target.value)}
                  placeholder="e.g. Book an appointment"
                  aria-label={`Objective ${index + 1}`}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => moveObjective(index, -1)}
                  disabled={index === 0}
                  aria-label={`Move objective ${index + 1} up`}
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => moveObjective(index, 1)}
                  disabled={index === objectives.length - 1}
                  aria-label={`Move objective ${index + 1} down`}
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeObjective(index)}
                  aria-label={`Delete objective ${index + 1}`}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ol>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <Button variant="outline" onClick={addObjective} disabled={loading}>
            <Plus className="mr-2 h-4 w-4" />
            Add Objective
          </Button>

          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">
              {dirty ? "Unsaved changes" : "Saved"}
            </span>
            <Button
              onClick={() => save.mutate(objectives)}
              disabled={save.isPending || loading || !workflowId}
            >
              {save.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Save Objectives
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default AiStudioObjectives;
