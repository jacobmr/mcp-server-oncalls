/**
 * OnCalls API Client
 * Handles authentication and API requests to OnCalls backend
 */

import { TokenManager } from './token-manager.js';
import type { UserContext, ApiError } from '../types/index.js';

// Actual OnCalls API login response format
interface OncallsLoginResponse {
  status: boolean;
  message?: string;
  token: string;
  refresh_token: string;
  data: {
    GroupId: number;
    docid: number;
    viewReqs: boolean;
    Admin: boolean;
    fname: string;
    lname: string;
    user_email: string;
    isdoc: boolean;
    superuser?: boolean;
  };
}

interface OncallsRefreshResponse {
  access_token?: string;
  token?: string;
}

export interface OncallsClientConfig {
  baseUrl: string;
  username: string;
  password: string;
}

export class OncallsClient {
  private readonly config: OncallsClientConfig;
  private readonly tokenManager: TokenManager;
  private _userContext: UserContext | null = null;

  constructor(config: OncallsClientConfig) {
    this.config = config;
    this.tokenManager = new TokenManager();
  }

  /**
   * Get authenticated user context
   */
  get userContext(): UserContext {
    if (!this._userContext) {
      throw new Error('Not authenticated. Call authenticate() first.');
    }
    return this._userContext;
  }

  /**
   * Check if client is authenticated
   */
  get isAuthenticated(): boolean {
    return this._userContext !== null && this.tokenManager.hasTokens();
  }

  /**
   * Authenticate with OnCalls API
   */
  async authenticate(): Promise<void> {
    const response = await fetch(`${this.config.baseUrl}/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: this.config.username,
        password: this.config.password,
      }),
    });

    if (!response.ok) {
      const error = await this.parseError(response);
      throw new Error(`Authentication failed: ${error.message}`);
    }

    const data = (await response.json()) as OncallsLoginResponse;

    // OnCalls API returns status as boolean
    if (data.status !== true) {
      throw new Error(`Authentication failed: ${data.message || 'Unknown error'}`);
    }

    // Store tokens (OnCalls uses 'token' not 'access_token')
    this.tokenManager.setTokens(data.token, data.refresh_token);

    // Extract user context from 'data' object
    this._userContext = {
      docId: data.data.docid,
      groupId: data.data.GroupId,
      username: this.config.username,
      firstName: data.data.fname,
      lastName: data.data.lname,
      email: data.data.user_email,
      isAdmin: data.data.Admin,
      viewReqs: data.data.viewReqs,
    };

    console.error(`[OnCalls] Authenticated as ${this._userContext.firstName} ${this._userContext.lastName} (Group: ${this._userContext.groupId}, Admin: ${this._userContext.isAdmin})`);
  }

  /**
   * Ensure valid token, refresh if needed
   */
  async ensureAuthenticated(): Promise<void> {
    if (!this.tokenManager.hasTokens()) {
      await this.authenticate();
      return;
    }

    if (this.tokenManager.needsRefresh()) {
      await this.refreshToken();
    }
  }

  /**
   * Refresh access token
   */
  private async refreshToken(): Promise<void> {
    const refreshToken = this.tokenManager.getRefreshToken();
    if (!refreshToken) {
      await this.authenticate();
      return;
    }

    try {
      const response = await fetch(`${this.config.baseUrl}/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${refreshToken}`,
        },
      });

      if (!response.ok) {
        // Refresh failed, re-authenticate
        console.error('[OnCalls] Token refresh failed, re-authenticating');
        await this.authenticate();
        return;
      }

      const data = (await response.json()) as OncallsRefreshResponse;
      // Handle both possible response formats
      const newToken = data.access_token || data.token;
      if (newToken) {
        this.tokenManager.updateAccessToken(newToken);
        console.error('[OnCalls] Token refreshed successfully');
      } else {
        console.error('[OnCalls] Token refresh returned no token, re-authenticating');
        await this.authenticate();
      }
    } catch {
      // Refresh failed, re-authenticate
      console.error('[OnCalls] Token refresh error, re-authenticating');
      await this.authenticate();
    }
  }

  /**
   * Make authenticated GET request
   */
  async get<T>(endpoint: string, params?: Record<string, string | number | boolean>): Promise<T> {
    await this.ensureAuthenticated();

    const url = new URL(`${this.config.baseUrl}${endpoint}`);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, String(value));
        }
      });
    }

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.tokenManager.getAccessToken()}`,
      },
    });

    if (!response.ok) {
      const error = await this.parseError(response);
      throw new Error(`API request failed: ${error.message}`);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Make authenticated POST request
   */
  async post<T>(endpoint: string, body: Record<string, unknown>): Promise<T> {
    await this.ensureAuthenticated();

    const response = await fetch(`${this.config.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.tokenManager.getAccessToken()}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await this.parseError(response);
      throw new Error(`API request failed: ${error.message}`);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Make authenticated PUT request
   */
  async put<T>(endpoint: string, body: Record<string, unknown>): Promise<T> {
    await this.ensureAuthenticated();

    const response = await fetch(`${this.config.baseUrl}${endpoint}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.tokenManager.getAccessToken()}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await this.parseError(response);
      throw new Error(`API request failed: ${error.message}`);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Parse error response
   */
  private async parseError(response: Response): Promise<ApiError> {
    try {
      const data = await response.json();
      return {
        status: 'error',
        message: data.message || data.error || `HTTP ${response.status}: ${response.statusText}`,
        code: data.code,
      };
    } catch {
      return {
        status: 'error',
        message: `HTTP ${response.status}: ${response.statusText}`,
      };
    }
  }
}
