"use client";

import { useQuery } from "@tanstack/react-query";
import { FileText, Download } from "lucide-react";
import { fetchMediaUrl, fetchMediaContent, type MessageMedia } from "@/lib/conversations-api";

/**
 * Resolves a message_media row to a short-lived signed URL via
 * GET /conversations/{id}/messages/{id}/media/{id}/url (never a raw storage
 * key/bucket URL) and renders the appropriate preview. In local-disk dev mode
 * (no S3_BUCKET configured on the gateway) there is no public file server to
 * point an <img>/<a> at, so the bytes are fetched through the backend proxy
 * (GET .../media/{id}/content) and rendered from a blob URL instead.
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
      // eslint-disable-next-line @next/next/no-img-element -- signed/blob URL is short-lived/opaque; next/image domain allow-listing doesn't apply
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
  const urlQuery = useQuery({
    queryKey: ["media-url", conversationId, messageId, media.id],
    queryFn: () => fetchMediaUrl(conversationId, messageId, media.id),
    staleTime: 60_000,
  });

  const isLocal = urlQuery.data?.kind === "local_file";

  // Local-disk mode has no public URL - fetch the bytes through the backend
  // proxy and render from a blob URL so previews work without MinIO.
  const contentQuery = useQuery({
    queryKey: ["media-content", conversationId, messageId, media.id],
    queryFn: async () => {
      const blob = await fetchMediaContent(conversationId, messageId, media.id, media.mime_type);
      return URL.createObjectURL(blob);
    },
    enabled: isLocal,
    staleTime: 60_000,
  });

  if (urlQuery.isLoading) {
    return <PreviewSkeleton />;
  }

  if (urlQuery.isError || !urlQuery.data) {
    return <PreviewError />;
  }

  if (isLocal) {
    if (contentQuery.isLoading) return <PreviewSkeleton />;
    if (contentQuery.isError || !contentQuery.data) return <PreviewError />;
    return <MediaView url={contentQuery.data} media={media} />;
  }

  if (!urlQuery.data.url) {
    return <PreviewError />;
  }
  return <MediaView url={urlQuery.data.url} media={media} />;
}
