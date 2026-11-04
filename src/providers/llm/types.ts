// LlmProvider: text completion used to write comic scripts. Real adapters send `system` and
// `prompt`; the deterministic twin reads the structured `script` request instead.
import type { StylePreset } from '../../shared/styles.js';

export interface ScriptCharacter {
  name: string;
  description: string;
}

export interface ScriptRequest {
  title: string;
  plot: string;
  style: StylePreset;
  characters: ScriptCharacter[];
  pages: number;
  realPeople: boolean;
}

export interface LlmRequest {
  system: string;
  prompt: string;
  maxTokens?: number;
  /** Structured form of the same request (used by the twin; ignored by real adapters). */
  script: ScriptRequest;
}

export interface LlmProvider {
  readonly name: string;
  complete(req: LlmRequest): Promise<string>;
}
