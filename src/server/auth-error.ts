/** Thrown when a request needs sign-in (401) or lacks access (403). */
export class AuthError extends Error {
  constructor(readonly status: 401 | 403) {
    super(status === 401 ? "Please sign in." : "You don't have access to this.");
  }
}
