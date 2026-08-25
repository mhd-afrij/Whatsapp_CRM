"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchUsers } from "@/lib/users-api";

export function useUsers() {
  return useQuery({
    queryKey: ["users"],
    queryFn: fetchUsers,
    staleTime: 5 * 60 * 1000,
  });
}
