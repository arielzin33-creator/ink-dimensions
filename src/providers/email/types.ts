// Email behind an interface (constitution article 3; spec 002 FR-116).
export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface EmailProvider {
  readonly name: string;
  /** False for the twin. In production, retention stays off without a real service (FR-123). */
  readonly real: boolean;
  send(message: EmailMessage): Promise<void>;
}
