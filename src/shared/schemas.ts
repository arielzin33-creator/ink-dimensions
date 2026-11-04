// Validation schemas shared by the API and the UI. Limits here are the spec's numbers.
import { z } from 'zod';
import { STYLE_IDS } from './styles.js';

export const LIMITS = {
  passwordMin: 10,
  passwordMax: 200,
  titleMax: 120,
  plotMax: 4000,
  characterNameMax: 80,
  characterDescriptionMax: 1000,
  imagesPerCharacter: 5,
  charactersPerProject: 12,
  pagesMax: 6,
  panelsPerPageMax: 6,
  dialoguePerPanelMax: 4,
  panelDescriptionMax: 600,
  dialogueTextMax: 300,
  captionMax: 200,
  renderPanelsMax: 36,
} as const;

export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export type ImageType = (typeof IMAGE_TYPES)[number];

const id = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/, 'must be an id');
const text = (max: number) => z.string().trim().max(max);

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'must be an email address');
export const passwordSchema = z.string().min(LIMITS.passwordMin, `must be at least ${LIMITS.passwordMin} characters`).max(LIMITS.passwordMax);

export const signUpSchema = z.object({ email: emailSchema, password: passwordSchema });
export const signInSchema = z.object({ email: emailSchema, password: z.string().min(1).max(LIMITS.passwordMax) });
export const deleteAccountSchema = z.object({ password: z.string().min(1).max(LIMITS.passwordMax) });

export const projectPathSchema = z.enum(['photo', 'invented']);
export type ProjectPath = z.infer<typeof projectPathSchema>;
export const styleIdSchema = z.enum(STYLE_IDS);

export const createProjectSchema = z.object({
  title: text(LIMITS.titleMax).min(1, 'is required'),
  path: projectPathSchema,
});
export const updateProjectSchema = z
  .object({
    title: text(LIMITS.titleMax).min(1).optional(),
    stylePreset: styleIdSchema.optional(),
    plot: z.string().max(LIMITS.plotMax).optional(),
  })
  .strict();

export const characterSchema = z.object({
  name: text(LIMITS.characterNameMax).min(1, 'is required'),
  description: text(LIMITS.characterDescriptionMax).optional().default(''),
});
export const updateCharacterSchema = z
  .object({
    name: text(LIMITS.characterNameMax).min(1).optional(),
    description: text(LIMITS.characterDescriptionMax).optional(),
  })
  .strict();

export const imageUploadSchema = z.object({
  kind: z.enum(['photo', 'reference']),
  contentType: z.enum(IMAGE_TYPES),
  dataBase64: z.string().min(1).regex(/^[A-Za-z0-9+/]+={0,2}$/, 'must be base64'),
  consent: z.boolean().optional(),
});

export const dialogueLineSchema = z.object({
  speaker: text(60).min(1),
  text: text(LIMITS.dialogueTextMax).min(1),
});

export const panelSchema = z.object({
  id: id.optional(),
  description: text(LIMITS.panelDescriptionMax).min(1, 'is required'),
  characters: z.array(text(LIMITS.characterNameMax).min(1)).max(6).default([]),
  dialogue: z.array(dialogueLineSchema).max(LIMITS.dialoguePerPanelMax).default([]),
  caption: text(LIMITS.captionMax).optional().default(''),
});

export const pageSchema = z.object({
  panels: z.array(panelSchema).min(1).max(LIMITS.panelsPerPageMax),
});

export const scriptSchema = z.object({
  title: text(LIMITS.titleMax).optional().default(''),
  pages: z.array(pageSchema).min(1).max(LIMITS.pagesMax),
});

export type ScriptInput = z.input<typeof scriptSchema>;
export type ParsedScript = z.output<typeof scriptSchema>;
export type Panel = Omit<z.output<typeof panelSchema>, 'id'> & { id: string };
export type Page = { panels: Panel[] };
export type Script = { title: string; pages: Page[] };

export const generateScriptSchema = z.object({ pages: z.number().int().min(1).max(LIMITS.pagesMax) });
export const saveScriptSchema = z.object({ version: z.number().int().min(0), script: scriptSchema });
export const renderSchema = z.object({ panelIds: z.array(id).min(1).max(LIMITS.renderPanelsMax).optional() });
