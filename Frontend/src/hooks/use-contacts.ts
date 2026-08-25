"use client";

import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useSocket } from "@/providers/socket-provider";
import { useAuth } from "@/context/auth-context";
import {
  archiveContact,
  createContact,
  fetchContact,
  fetchContacts,
  importContacts,
  mergeDuplicateContacts,
  restoreContact,
  updateContact,
  type ContactFilters,
  type ContactFormValues,
} from "@/lib/contacts-api";

export const contactsKey = (filters: ContactFilters) => ["contacts", filters] as const;
export const contactKey = (id: number) => ["contacts", "detail", id] as const;

export function useContactList(filters: ContactFilters) {
  return useQuery({
    queryKey: contactsKey(filters),
    queryFn: () => fetchContacts(filters),
    placeholderData: keepPreviousData,
  });
}

export function useContact(id: number) {
  return useQuery({
    queryKey: contactKey(id),
    queryFn: () => fetchContact(id),
    enabled: Number.isFinite(id) && id > 0,
  });
}

export function useCreateContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: ContactFormValues) => createContact(values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
    },
  });
}

export function useUpdateContact(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: ContactFormValues) => updateContact(id, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      queryClient.invalidateQueries({ queryKey: contactKey(id) });
    },
  });
}

export function useArchiveContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => archiveContact(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
    },
  });
}

export function useRestoreContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => restoreContact(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
    },
  });
}

export function useImportContacts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => importContacts(file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
    },
  });
}

/**
 * Runs the duplicate-contact merge (dryRun=true previews without changing
 * anything). Invalidates contact caches after a real merge so lists refresh.
 */
export function useMergeDuplicateContacts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dryRun: boolean) => mergeDuplicateContacts(dryRun),
    onSuccess: (report) => {
      if (report.merged > 0) {
        queryClient.invalidateQueries({ queryKey: ["contacts"] });
      }
    },
  });
}

/**
 * Subscribes to the gateway's `contact.created/updated/deleted` events (spec
 * §17) and invalidates the contact list + any open detail query so the UI
 * updates without a reload. Contacts are workspace-shared, so this joins the
 * same inbox room the conversation list uses and lets the envelope wrapper
 * filter out other workspaces.
 */
export function useContactRealtime() {
  const { socket } = useSocket();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!socket || !user?.workspace_id) return;

    const joinRoom = () => {
      socket.emit("join", `workspace:${user.workspace_id}:inbox`);
    };
    joinRoom();
    socket.on("connect", joinRoom);

    const refresh = () => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
    };
    const handlePayload = (payload: { contact_id?: number }) => {
      refresh();
      if (payload?.contact_id) {
        queryClient.invalidateQueries({ queryKey: contactKey(payload.contact_id) });
      }
    };

    socket.on("contact.created", handlePayload);
    socket.on("contact.updated", handlePayload);
    socket.on("contact.deleted", handlePayload);

    return () => {
      socket.off("connect", joinRoom);
      socket.off("contact.created", handlePayload);
      socket.off("contact.updated", handlePayload);
      socket.off("contact.deleted", handlePayload);
    };
  }, [socket, user?.workspace_id, queryClient]);
}
