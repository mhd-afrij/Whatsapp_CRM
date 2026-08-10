"use client";

import { Archive, Pin, Volume2, MoreVertical } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import type { Conversation } from "@/lib/conversations-api";

interface ConversationItemProps {
  conversation: Conversation;
  isSelected: boolean;
  onClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  formatTime: (date: string | null) => string;
}

export function ConversationItem({
  conversation,
  isSelected,
  onClick,
  onContextMenu,
  formatTime,
}: ConversationItemProps) {
  const contact = conversation.contact || conversation.whatsapp_contact;
  const name =
    (conversation.contact?.full_name as string) ||
    (conversation.whatsapp_contact?.push_name as string) ||
    contact?.phone_number ||
    `Conversation #${conversation.id}`;

  const isOnline = conversation.whatsapp_contact?.is_online === true;
  const hasUnread = conversation.unread_count > 0;
  const lastMessageTime = conversation.last_message_at;
  const profilePicUrl = conversation.contact?.profile_picture_url || conversation.whatsapp_contact?.profile_picture_url;

  return (
    <div
      onClick={onClick}
      onContextMenu={onContextMenu}
      className={cn(
        "group flex items-center gap-3 px-3 py-3 cursor-pointer transition-colors border-b border-border hover:bg-primary-soft/10",
        isSelected ? "bg-primary-soft/20" : ""
      )}
    >
      {/* Avatar with online indicator */}
      <div className="relative flex-shrink-0">
        {profilePicUrl ? (
          <img
            src={profilePicUrl}
            alt={name}
            className="w-12 h-12 rounded-full object-cover"
          />
        ) : (
          <Avatar name={name} size="md" />
        )}
        {isOnline && (
          <span className="absolute right-0 bottom-0 w-3 h-3 bg-success rounded-full border-2 border-surface" />
        )}
      </div>

      {/* Name + Preview + Time */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="font-semibold text-text truncate">{name}</p>
          <span className="text-xs text-muted flex-shrink-0 whitespace-nowrap ml-2">
            {lastMessageTime ? formatTime(lastMessageTime) : ""}
          </span>
        </div>
        <p className="text-sm text-muted truncate">
          {conversation.last_message_preview || "(No messages yet)"}
        </p>
      </div>

      {/* Unread indicator + Actions (hover) */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {hasUnread && (
          <span className="w-2.5 h-2.5 rounded-full bg-primary" />
        )}

        {/* Hover action menu */}
        <div className="hidden group-hover:flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <ActionButton icon={Pin} label="Pin" size="sm" />
          <ActionButton icon={Archive} label="Archive" size="sm" />
          <ActionButton icon={Volume2} label="Mute" size="sm" />
          <ActionButton icon={MoreVertical} label="More" size="sm" />
        </div>
      </div>
    </div>
  );
}

function ActionButton({
  icon: Icon,
  label,
  size = "md",
  onClick,
}: {
  icon: typeof Archive;
  label: string;
  size?: "sm" | "md";
  onClick?: () => void;
}) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      className={cn(
        "rounded-lg hover:bg-primary-soft/20 transition-colors",
        size === "sm" ? "p-1.5" : "p-2"
      )}
      title={label}
      type="button"
    >
      <Icon className={size === "sm" ? "w-4 h-4" : "w-5 h-5"} />
    </button>
  );
}
