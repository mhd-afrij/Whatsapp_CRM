"use client";

import { AlertCircle, CheckCheck, Check, Clock } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { MessageStatus } from "@/lib/conversations-api";

interface MessageStatusTickProps {
  status: MessageStatus;
  onRetry?: () => void;
  isFailed?: boolean;
  /** When the recipient's device acknowledged delivery (tooltip: "Delivered at ..."). */
  deliveredAt?: string | null;
  /** When the recipient reported reading the message (tooltip: "Read at ..."). */
  readAt?: string | null;
}

const STATUS_CONFIG: Record<MessageStatus, { icon: React.ReactNode; label: string; color: string }> = {
  queued: {
    icon: <Clock className="h-3.5 w-3.5" />,
    label: "Queued",
    color: "text-muted",
  },
  sent: {
    icon: <Check className="h-3.5 w-3.5" />,
    label: "Sent",
    color: "text-muted",
  },
  delivered: {
    icon: <CheckCheck className="h-3.5 w-3.5" />,
    label: "Delivered",
    color: "text-muted",
  },
  read: {
    icon: <CheckCheck className="h-3.5 w-3.5" />,
    label: "Read",
    color: "text-info",
  },
  failed: {
    icon: <AlertCircle className="h-3.5 w-3.5" />,
    label: "Failed",
    color: "text-danger",
  },
};

function formatClockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function MessageStatusTick({ status, onRetry, isFailed, deliveredAt, readAt }: MessageStatusTickProps) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.queued;

  // Mirror WhatsApp: 1 grey tick = sent, 2 grey ticks = delivered, 2 blue = read.
  const label =
    status === "read" && readAt
      ? `Read at ${formatClockTime(readAt)}`
      : status === "delivered" && deliveredAt
        ? `Delivered at ${formatClockTime(deliveredAt)}`
        : config.label;

  const tickElement = (
    <div className={`flex items-center ${config.color}`}>
      {config.icon}
    </div>
  );

  if (isFailed && onRetry) {
    return (
      <Tooltip>
        <TooltipTrigger
          onClick={onRetry}
          className="text-danger hover:text-danger/80 transition-colors"
          aria-label="Retry sending message"
        >
          {tickElement}
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          {config.label} - Click to retry
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger render={<div className="cursor-default">{tickElement}</div>} />
      <TooltipContent side="top" className="text-xs">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
