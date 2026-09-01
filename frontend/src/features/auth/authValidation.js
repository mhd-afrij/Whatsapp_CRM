import { isValidEmail } from "../../utils/validators.js";

export function validateLoginForm({ workspace, email, password }) {
  const errors = {};

  if (!workspace?.trim()) {
    errors.workspace = "Workspace is required";
  }

  if (!email?.trim()) {
    errors.email = "Email is required";
  } else if (!isValidEmail(email)) {
    errors.email = "Invalid email format";
  }

  if (!password) {
    errors.password = "Password is required";
  } else if (password.length < 6) {
    errors.password = "Password must be at least 6 characters";
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}
