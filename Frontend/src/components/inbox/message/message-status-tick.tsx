"use client";

import { AlertCircle, CheckCheck, Check, Clock, Send } from "lucide-react";
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
}

const STATUS_CONFIG: Record<MessageStatus, { icon: React.ReactNode; label: string; color: string }> = {
  queued: {
    icon: <Clock className="h-4 w-4" />,
    label: "Queued",
    color: "text-muted",
  },
  sending: {
    icon: <Send className="h-4 w-4" />,
    label: "Sending",
    color: "text-muted",
  },
  sent: {
    icon: <Check className="h-4 w-4" />,
    label: "Sent",
    color: "text-muted",
  },
  delivered: {
    icon: <CheckCheck className="h-4 w-4" />,
    label: "Delivered",
    color: "text-muted",
  },
  read: {
    icon: <CheckCheck className="h-4 w-4" />,
    label: "Read",
    color: "text-primary",
  },
  failed: {
    icon: <AlertCircle className="h-4 w-4" />,
    label: "Failed",
    color: "text-danger",
  },
};

export function MessageStatusTick({ status, onRetry, isFailed }: MessageStatusTickProps) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.queued;

  const tickElement = (
    <div className={`flex items-center ${config.color}`}>
      {config.icon}
    </div>
  );

  if (isFailed && onRetry) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onRetry}
            className="text-danger hover:text-danger/80 transition-colors"
            aria-label="Retry sending message"
          >
            {tickElement}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          {config.label} - Click to retry
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="cursor-default">{tickElement}</div>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        {config.label}
      </TooltipContent>
    </Tooltip>
  );
}
