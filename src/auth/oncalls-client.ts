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

export interface OAuthClientConfig {
  baseUrl: string;
  accessToken: string;
  refreshToken: string;
  clientId: string;
  clientSecret: string;
  tokenUrl: string;
}

interface OAuthUserInfoResponse {
  sub: string;
  name: string;
  given_name: string;
  family_name: string;
  email: string;
  email_verified: boolean;
  group_id: number;
  is_admin: boolean;
}

export class OncallsClient {
  private readonly config: OncallsClientConfig;
  private readonly tokenManager: TokenManager;
  private _userContext: UserContext | null = null;
  private oauthConfig: OAuthClientConfig | null = null;

  constructor(config: OncallsClientConfig) {
    this.config = config;
    this.tokenManager = new TokenManager();
  }

  /**
   * Create an OncallsClient from OAuth tokens
   * Used when authenticating via OAuth 2.0 flow
   */
  static async fromOAuthTokens(oauthConfig: OAuthClientConfig): Promise<OncallsClient> {
    // Create a dummy config (won't be used for auth)
    const client = new OncallsClient({
      baseUrl: oauthConfig.baseUrl,
      username: '',
      password: '',
    });

    client.oauthConfig = oauthConfig;
    client.tokenManager.setTokens(oauthConfig.accessToken, oauthConfig.refreshToken);

    // Fetch user info from OAuth userinfo endpoint
    const userInfoUrl = oauthConfig.baseUrl.replace('/api', '') + '/oauth/userinfo';
    const response = await fetch(userInfoUrl, {
      headers: {
        Authorization: `Bearer ${oauthConfig.accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get user info: ${response.status}`);
    }

    const userInfo = (await response.json()) as OAuthUserInfoResponse;

    client._userContext = {
      docId: parseInt(userInfo.sub, 10),
      groupId: userInfo.group_id,
      username: userInfo.email,
      firstName: userInfo.given_name,
      lastName: userInfo.family_name,
      email: userInfo.email,
      isAdmin: userInfo.is_admin,
      viewReqs: userInfo.is_admin, // Admins can view requests
    };

    console.error(
      `[OnCalls OAuth] Authenticated as ${client._userContext.firstName} ${client._userContext.lastName} (Group: ${client._userContext.groupId}, Admin: ${client._userContext.isAdmin})`
    );

    return client;
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

    console.error(
      `[OnCalls] Authenticated as ${this._userContext.firstName} ${this._userContext.lastName} (Group: ${this._userContext.groupId}, Admin: ${this._userContext.isAdmin})`
    );
  }

  /**
   * Ensure valid token, refresh if needed
   */
  async ensureAuthenticated(): Promise<void> {
    if (!this.tokenManager.hasTokens()) {
      if (this.oauthConfig) {
        throw new Error('OAuth session expired. Please re-authenticate.');
      }
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
      if (this.oauthConfig) {
        throw new Error('OAuth session expired. Please re-authenticate.');
      }
      await this.authenticate();
      return;
    }

    // Use OAuth refresh if configured
    if (this.oauthConfig) {
      await this.refreshOAuthToken();
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
   * Refresh OAuth access token using refresh_token grant
   */
  private async refreshOAuthToken(): Promise<void> {
    if (!this.oauthConfig) {
      throw new Error('OAuth not configured');
    }

    const refreshToken = this.tokenManager.getRefreshToken();
    if (!refreshToken) {
      throw new Error('No refresh token available');
    }

    try {
      const response = await fetch(this.oauthConfig.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: this.oauthConfig.clientId,
          client_secret: this.oauthConfig.clientSecret,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OAuth refresh failed: ${error}`);
      }

      const data = (await response.json()) as {
        access_token: string;
        refresh_token?: string;
        expires_in?: number;
      };

      this.tokenManager.updateAccessToken(data.access_token);
      if (data.refresh_token) {
        this.tokenManager.setTokens(data.access_token, data.refresh_token);
      }

      console.error('[OnCalls OAuth] Token refreshed successfully');
    } catch (error) {
      console.error('[OnCalls OAuth] Token refresh failed:', error);
      throw new Error('OAuth session expired. Please re-authenticate.');
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
