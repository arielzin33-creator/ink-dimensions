// ImageProvider: renders one comic panel. Real adapters call a hosted API or a self-hosted
// pipeline; the twin draws neutral placeholder art (shapes and labels) as SVG.
import type { StylePreset } from '../../shared/styles.js';

export type RenderedContentType = 'image/svg+xml' | 'image/png' | 'image/jpeg' | 'image/webp';

export interface ReferenceImage {
  characterName: string;
  kind: 'photo' | 'reference';
  contentType: string;
  data: Buffer;
}

export interface PanelRenderRequest {
  panelId: string;
  width: number;
  height: number;
  style: StylePreset;
  description: string;
  characters: Array<{ name: string; description: string }>;
  /** Full positive prompt: style + description + characters. */
  prompt: string;
  negativePrompt: string;
  /** Only the project's own images, already filtered by what this provider may receive. */
  references: ReferenceImage[];
  seed: number;
}

export interface RenderedImage {
  contentType: RenderedContentType;
  data: Buffer;
}

export interface ImageProvider {
  readonly name: string;
  /** Whether real photos may be sent to this provider (spec FR-022). */
  readonly acceptsPhotos: boolean;
  render(req: PanelRenderRequest): Promise<RenderedImage>;
}

export const NEGATIVE_PROMPT = 'text, watermark, signature, logo, extra limbs, deformed hands, nudity, gore';
