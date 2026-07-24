export interface Workspace {
  id: number;
  uuid: string;
  name: string;
  slug: string;
  timezone: string;
  status: string;
}

export interface AuthUser {
  id: number;
  uuid: string;
  name: string;
  email: string;
  avatar_path: string | null;
  status: string;
  last_login_at: string | null;
  workspace: Workspace;
  roles: string[];
  permissions: string[];
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  user: AuthUser;
}

export interface ApiErrorBody {
  message: string;
  code?: string;
  errors?: Record<string, string[]> | null;
  request_id?: string;
}
