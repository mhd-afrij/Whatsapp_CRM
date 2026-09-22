"use client";

import { useQuery } from "@tanstack/react-query";
import { FileText, Download } from "lucide-react";
import { fetchMediaContent, type MessageMedia } from "@/lib/conversations-api";

/**
 * Resolves a message_media row by fetching its raw bytes through the backend
 * proxy (GET .../media/{id}/content) and rendering them from a blob URL —
 * the gateway stores media on its local disk, so there is no public file
 * server to point an <img>/<a> at.
 */
function PreviewSkeleton() {
  return <div className="h-32 w-48 animate-pulse rounded-md bg-border/60" />;
}

function PreviewError({ message = "Unable to load attachment." }: { message?: string }) {
  return (
    <p className="rounded-md border border-border bg-bg px-3 py-2 text-xs text-danger">{message}</p>
  );
}

/** Renders a preview/download from a directly usable URL (signed URL or local blob URL). */
function MediaView({ url, media }: { url: string; media: MessageMedia }) {
  if (media.mime_type.startsWith("image/")) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- blob URL is short-lived/opaque; next/image domain allow-listing doesn't apply
      <img
        src={url}
        alt="Attachment"
        className="max-h-64 max-w-xs rounded-md border border-border object-cover"
      />
    );
  }

  if (media.mime_type.startsWith("video/")) {
    return (
      <video controls className="max-h-64 max-w-xs rounded-md border border-border">
        <source src={url} type={media.mime_type} />
      </video>
    );
  }

  if (media.mime_type.startsWith("audio/")) {
    return <audio controls src={url} className="max-w-xs" />;
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-2 rounded-md border border-border bg-bg px-3 py-2 text-sm text-primary-dark hover:underline"
    >
      <FileText className="h-4 w-4" />
      Download attachment
      <Download className="h-3.5 w-3.5" />
    </a>
  );
}

export function MediaPreview({
  conversationId,
  messageId,
  media,
}: {
  conversationId: number;
  messageId: number;
  media: MessageMedia;
}) {
  const contentQuery = useQuery({
    queryKey: ["media-content", conversationId, messageId, media.id],
    queryFn: async () => {
      const blob = await fetchMediaContent(conversationId, messageId, media.id, media.mime_type);
      return URL.createObjectURL(blob);
    },
    staleTime: 60_000,
  });

  if (contentQuery.isLoading) {
    return <PreviewSkeleton />;
  }

  if (contentQuery.isError || !contentQuery.data) {
    return <PreviewError />;
  }

  return <MediaView url={contentQuery.data} media={media} />;
}
