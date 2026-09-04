"use client";

import { useState, useRef, useEffect } from "react";
import { SmilePlus } from "lucide-react";
import type { MessageReaction } from "@/lib/conversations-api";
import { cn } from "@/lib/utils";

type ReactionSummary = {
  emoji: string;
  count: number;
  hasMyReaction: boolean;
};

const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

export function summarizeReactions(
  reactions: MessageReaction[] | undefined,
  currentUserId?: number
): ReactionSummary[] {
  if (!reactions || reactions.length === 0) return [];

  const counts = new Map<string, { count: number; hasMyReaction: boolean }>();
  for (const reaction of reactions) {
    const existing = counts.get(reaction.emoji) ?? { count: 0, hasMyReaction: false };
    counts.set(reaction.emoji, {
      count: existing.count + 1,
      hasMyReaction: existing.hasMyReaction || reaction.user_id === currentUserId,
    });
  }

  return [...counts.entries()]
    .map(([emoji, { count, hasMyReaction }]) => ({ emoji, count, hasMyReaction }))
    .sort((left, right) => {
      if (right.count !== left.count) return right.count - left.count;
      return left.emoji.localeCompare(right.emoji);
    });
}

interface ReactionPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

function ReactionPicker({ onSelect, onClose }: ReactionPickerProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute bottom-full left-0 mb-1 flex items-center gap-1 rounded-full border border-border bg-surface px-2 py-1 shadow-lg z-30"
    >
      {QUICK_REACTIONS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          onClick={() => {
            onSelect(emoji);
            onClose();
          }}
          className="h-8 w-8 flex items-center justify-center rounded-full text-lg hover:bg-bg transition-colors"
          aria-label={`React with ${emoji}`}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}

interface MessageReactionsProps {
  reactions?: MessageReaction[];
  currentUserId?: number;
  onAddReaction?: (emoji: string) => void;
  onRemoveReaction?: (emoji: string) => void;
}

export function MessageReactions({
  reactions,
  currentUserId,
  onAddReaction,
  onRemoveReaction,
}: MessageReactionsProps) {
  const [showPicker, setShowPicker] = useState(false);
  const summary = summarizeReactions(reactions, currentUserId);

  if (summary.length === 0) return null;

  const handleReactionClick = (reaction: ReactionSummary) => {
    if (reaction.hasMyReaction && onRemoveReaction) {
      onRemoveReaction(reaction.emoji);
    } else if (onAddReaction) {
      onAddReaction(reaction.emoji);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1 rounded-full bg-[#202c33] border border-[#111b21] px-1.5 py-0.5 shadow-md">
      {summary.map((reaction) => (
        <button
          key={reaction.emoji}
          type="button"
          onClick={() => handleReactionClick(reaction)}
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-1 text-[11px] leading-none transition-colors",
            reaction.hasMyReaction
              ? "text-emerald-400 font-semibold"
              : "text-[#8696a0] hover:text-[#e9edef]"
          )}
          title={`${reaction.emoji} reacted ${reaction.count} time${reaction.count === 1 ? "" : "s"}`}
        >
          <span aria-hidden="true">{reaction.emoji}</span>
          <span>{reaction.count}</span>
        </button>
      ))}

      {onAddReaction && (
        <div className="relative">
          {showPicker && (
            <ReactionPicker
              onSelect={onAddReaction}
              onClose={() => setShowPicker(false)}
            />
          )}
        </div>
      )}
    </div>
  );
}
