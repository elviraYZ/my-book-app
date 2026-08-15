import {
  Braces,
  Gamepad2,
  Leaf,
  Sparkles,
  Trees,
  Users,
  type LucideIcon,
} from "lucide-react";

import type { Topic } from "@/lib/types";

export const TOPIC_ICONS: Record<
  NonNullable<Topic["icon"]>,
  LucideIcon
> = {
  forest: Trees,
  myth: Sparkles,
  team: Users,
  loop: Gamepad2,
  art: Sparkles,
  game: Gamepad2,
  code: Braces,
  spark: Sparkles,
  growth: Leaf,
};
