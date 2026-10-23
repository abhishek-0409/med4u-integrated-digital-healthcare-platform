import React from "react";
import { LucideIcon } from "lucide-react-native";
import { EmptyState } from "./EmptyState";
import { Screen } from "./Screen";

interface ComingSoonProps {
  icon: LucideIcon;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

/** Honest placeholder for a feature that has no backend yet: no fake data, no fake buttons. */
export function ComingSoon({ icon, title, message, actionLabel, onAction }: ComingSoonProps) {
  return (
    <Screen>
      <EmptyState icon={icon} title={title} message={message} actionLabel={actionLabel} onAction={onAction} />
    </Screen>
  );
}
