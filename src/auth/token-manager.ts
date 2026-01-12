/**
 * JWT Token Manager
 * Handles token storage, expiry checking, and refresh
 */

export interface TokenData {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // Unix timestamp
}

export class TokenManager {
  private tokenData: TokenData | null = null;
  private readonly refreshBufferMs = 60 * 1000; // Refresh 1 minute before expiry

  /**
   * Store tokens from login response
   */
  setTokens(accessToken: string, refreshToken: string, expiresInSeconds: number = 3600): void {
    this.tokenData = {
      accessToken,
      refreshToken,
      expiresAt: Date.now() + expiresInSeconds * 1000,
    };
  }

  /**
   * Update access token after refresh
   */
  updateAccessToken(accessToken: string, expiresInSeconds: number = 3600): void {
    if (!this.tokenData) {
      throw new Error('No token data available. Call setTokens first.');
    }
    this.tokenData.accessToken = accessToken;
    this.tokenData.expiresAt = Date.now() + expiresInSeconds * 1000;
  }

  /**
   * Get current access token
   */
  getAccessToken(): string | null {
    return this.tokenData?.accessToken ?? null;
  }

  /**
   * Get refresh token
   */
  getRefreshToken(): string | null {
    return this.tokenData?.refreshToken ?? null;
  }

  /**
   * Check if token needs refresh
   */
  needsRefresh(): boolean {
    if (!this.tokenData) return true;
    return Date.now() >= this.tokenData.expiresAt - this.refreshBufferMs;
  }

  /**
   * Check if we have valid tokens
   */
  hasTokens(): boolean {
    return this.tokenData !== null && this.tokenData.accessToken !== null;
  }

  /**
   * Clear all tokens
   */
  clear(): void {
    this.tokenData = null;
  }
}
