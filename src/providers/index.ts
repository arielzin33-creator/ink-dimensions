// Builds the provider set from configuration. Twins are the default (constitution article 3).
import type { Config } from '../server/config.js';
import { createComfyUiImage } from './image/comfyui.js';
import { createHostedImage } from './image/hosted.js';
import { createTwinImage } from './image/twin.js';
import type { ImageProvider } from './image/types.js';
import { createAnthropicLlm } from './llm/anthropic.js';
import { createOpenAiCompatibleLlm } from './llm/openai-compatible.js';
import { createTwinLlm } from './llm/twin.js';
import type { LlmProvider } from './llm/types.js';
import { createPermissiveModeration } from './moderation/permissive.js';
import { createRulesModeration } from './moderation/rules.js';
import type { ModerationProvider } from './moderation/types.js';
import { createLocalStorage } from './storage/local.js';
import { createMemoryStorage } from './storage/memory.js';
import type { StorageProvider } from './storage/types.js';

export interface Providers {
  llm: LlmProvider;
  image: ImageProvider;
  storage: StorageProvider;
  moderation: ModerationProvider;
}

export function createProviders(config: Config): Providers {
  const llm: LlmProvider =
    config.llm.provider === 'anthropic'
      ? createAnthropicLlm(config.llm)
      : config.llm.provider === 'local'
        ? createOpenAiCompatibleLlm(config.llm)
        : createTwinLlm();
  const image: ImageProvider =
    config.image.provider === 'hosted' ? createHostedImage(config.image) : config.image.provider === 'comfyui' ? createComfyUiImage(config.image) : createTwinImage();
  const storage = config.storage.provider === 'memory' ? createMemoryStorage() : createLocalStorage(config.storage.dir);
  const moderation = config.moderation === 'permissive' ? createPermissiveModeration() : createRulesModeration();
  return { llm, image, storage, moderation };
}
