// ModerationProvider: decides whether text that will drive a comic may be used.
// The constitution (article 8) requires refusing real people (the photo path) in sexual,
// violent-harm or defamatory scenarios.

export type ModerationCategory = 'sexual' | 'violent_harm' | 'defamatory';

export interface ModerationInput {
  /** True when the project's characters are real people (the photo path). */
  realPeople: boolean;
  /** Plot, panel descriptions, dialogue and captions to check. */
  texts: string[];
}

export interface ModerationResult {
  allowed: boolean;
  categories: ModerationCategory[];
}

export interface ModerationProvider {
  readonly name: string;
  check(input: ModerationInput): Promise<ModerationResult>;
}
