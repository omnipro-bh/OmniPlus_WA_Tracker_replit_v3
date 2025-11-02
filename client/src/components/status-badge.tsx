import { cn } from "@/lib/utils";

type Status =
  | "ACTIVE"
  | "PAUSED"
  | "PENDING_AUTH"
  | "QUEUED"
  | "PENDING"
  | "PROCESSING"
  | "SENT"
  | "DELIVERED"
  | "READ"
  | "FAILED"
  | "REPLIED"
  | "PARTIAL"
  | "COMPLETED"
  | "EXPIRED"
  | "CANCELLED"
  | "APPROVED"
  | "REJECTED"
  | "DISABLED";

interface StatusBadgeProps {
  status: Status;
  className?: string;
}

const statusStyles: Record<
  Status,
  { bg: string; text: string; border: string }
> = {
  ACTIVE: {
    bg: "bg-success/10",
    text: "text-success",
    border: "border-success/20",
  },
  DELIVERED: {
    bg: "bg-info/10",
    text: "text-info",
    border: "border-info/20",
  },
  READ: {
    bg: "bg-info/10",
    text: "text-info",
    border: "border-info/20",
  },
  SENT: {
    bg: "bg-info/10",
    text: "text-info",
    border: "border-info/20",
  },
  APPROVED: {
    bg: "bg-success/10",
    text: "text-success",
    border: "border-success/20",
  },
  PENDING: {
    bg: "bg-warning/10",
    text: "text-warning",
    border: "border-warning/20",
  },
  PENDING_AUTH: {
    bg: "bg-warning/10",
    text: "text-warning",
    border: "border-warning/20",
  },
  QUEUED: {
    bg: "bg-warning/10",
    text: "text-warning",
    border: "border-warning/20",
  },
  PROCESSING: {
    bg: "bg-info/10",
    text: "text-info",
    border: "border-info/20",
  },
  COMPLETED: {
    bg: "bg-success/10",
    text: "text-success",
    border: "border-success/20",
  },
  PAUSED: {
    bg: "bg-slate-500/10",
    text: "text-slate-400",
    border: "border-slate-500/20",
  },
  CANCELLED: {
    bg: "bg-slate-500/10",
    text: "text-slate-400",
    border: "border-slate-500/20",
  },
  EXPIRED: {
    bg: "bg-error/10",
    text: "text-error",
    border: "border-error/20",
  },
  FAILED: {
    bg: "bg-error/10",
    text: "text-error",
    border: "border-error/20",
  },
  REJECTED: {
    bg: "bg-error/10",
    text: "text-error",
    border: "border-error/20",
  },
  PARTIAL: {
    bg: "bg-warning/10",
    text: "text-warning",
    border: "border-warning/20",
  },
  REPLIED: {
    bg: "bg-success/10",
    text: "text-success",
    border: "border-success/20",
  },
  DISABLED: {
    bg: "bg-slate-500/10",
    text: "text-slate-400",
    border: "border-slate-500/20",
  },
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const style = statusStyles[status] || statusStyles.PENDING;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold",
        style.bg,
        style.text,
        style.border,
        className
      )}
      data-testid={`badge-status-${status.toLowerCase()}`}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}
