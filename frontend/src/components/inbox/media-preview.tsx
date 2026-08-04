"use client";

import { useQuery } from "@tanstack/react-query";
import { FileText, Download } from "lucide-react";
import { fetchMediaUrl, type MessageMedia } from "@/lib/conversations-api";

/**
 * Resolves a message_media row to a short-lived signed URL via
 * GET /conversations/{id}/messages/{id}/media/{id}/url (never a raw storage
 * key/bucket URL) and renders the appropriate preview. In local-disk dev mode
 * (no S3_BUCKET configured on the gateway) there is no public file server to
 * point an <img>/<a> at yet, so that case renders a clear "unavailable in
 * local mode" notice rather than a broken link.
 */
export function MediaPreview({
  conversationId,
  messageId,
  media,
}: {
  conversationId: number;
  messageId: number;
  media: MessageMedia;
}) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["media-url", conversationId, messageId, media.id],
    queryFn: () => fetchMediaUrl(conversationId, messageId, media.id),
    staleTime: 60_000,
  });

  if (isLoading) {
    return <div className="h-32 w-48 animate-pulse rounded-md bg-border/60" />;
  }

  if (isError || !data) {
    return (
      <p className="rounded-md border border-border bg-bg px-3 py-2 text-xs text-danger">
        Unable to load attachment.
      </p>
    );
  }

  if (data.kind === "local_file") {
    return (
      <p className="rounded-md border border-dashed border-border bg-bg px-3 py-2 text-xs text-muted">
        Attachment stored locally (no MinIO configured) — preview unavailable outside the gateway host.
      </p>
    );
  }

  if (media.mime_type.startsWith("image/")) {
    // eslint-disable-next-line @next/next/no-img-element -- signed URL is short-lived/opaque; next/image domain allow-listing doesn't apply
    return <img src={data.url} alt="Attachment" className="max-h-64 max-w-xs rounded-md border border-border object-cover" />;
  }

  if (media.mime_type.startsWith("video/")) {
    return (
      <video controls className="max-h-64 max-w-xs rounded-md border border-border">
        <source src={data.url} type={media.mime_type} />
      </video>
    );
  }

  if (media.mime_type.startsWith("audio/")) {
    return <audio controls src={data.url} className="max-w-xs" />;
  }

  return (
    <a
      href={data.url}
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
