import type { ApiErrorBody } from "@/types/auth";

export class ApiError extends Error {
  code?: string;
  status: number;
  errors?: Record<string, string[]> | null;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message || "Request failed");
    this.status = status;
    this.code = body.code;
    this.errors = body.errors;
  }
}
