import type { ComponentType } from "react";
import {
  BarChart3,
  Bell,
  Bot,
  Calendar,
  CheckCircle2,
  Clock,
  FileText,
  HeartPulse,
  ListChecks,
  Lock,
  MapPin,
  Megaphone,
  MessageSquare,
  Phone,
  Repeat,
  Send,
  ShieldCheck,
  Sparkles,
  Star,
  Stethoscope,
  Target,
  Timer,
  TrendingUp,
  UserCheck,
  Users,
  Workflow,
  Zap,
} from "lucide-react";
import type { IconKey } from "@/data/industries";

/**
 * Explicit icon registry.
 *
 * Deliberately not `import { icons } from "lucide-react"` (as landing.tsx does):
 * that pulls the entire icon set into the client bundle. Naming icons in the
 * config keeps the registry tree-shakeable.
 */
const registry: Record<IconKey, ComponentType<{ className?: string }>> = {
  calendar: Calendar,
  clock: Clock,
  users: Users,
  megaphone: Megaphone,
  chart: BarChart3,
  shield: ShieldCheck,
  bot: Bot,
  messages: MessageSquare,
  bell: Bell,
  stethoscope: Stethoscope,
  fileText: FileText,
  workflow: Workflow,
  checkCircle: CheckCircle2,
  star: Star,
  zap: Zap,
  trendingUp: TrendingUp,
  heartPulse: HeartPulse,
  phone: Phone,
  userCheck: UserCheck,
  target: Target,
  listChecks: ListChecks,
  send: Send,
  sparkles: Sparkles,
  mapPin: MapPin,
  lock: Lock,
  repeat: Repeat,
  timer: Timer,
};

export function IndustryIcon({ name, className }: { name: IconKey; className?: string }) {
  const Icon = registry[name] ?? MessageSquare;
  return <Icon className={className} />;
}
