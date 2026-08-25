import type { UseFormSetError, FieldValues, Path } from "react-hook-form";
import { ApiError } from "./api-client";

/**
 * Maps the backend's `{ success: false, errors: { field: string[] } }`
 * validation shape onto react-hook-form field errors, so server-side
 * validation renders inline next to the offending input just like client
 * validation does. Falls back to returning the top-level message when the
 * error isn't a field-keyed object (e.g. a 403/423 domain error) so the
 * caller can show it as a form-level banner instead.
 */
export function applyApiErrorsToForm<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>
): string {
  if (!(error instanceof ApiError)) {
    return "Something went wrong. Please try again.";
  }

  if (error.errors && !Array.isArray(error.errors)) {
    for (const [field, messages] of Object.entries(error.errors)) {
      // Guard: setError throws if the field doesn't exist in the form schema.
      // When that happens the exception propagates out of the caller's catch
      // block, leaving react-hook-form's isSubmitting stuck at true forever.
      try {
        setError(field as Path<T>, { type: "server", message: messages[0] });
      } catch {
        // Field not in this form schema — skip the field-level error and rely
        // on the top-level message returned below.
      }
    }
    return error.message;
  }

  return error.message;
}
