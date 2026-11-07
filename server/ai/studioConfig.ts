/**
 * AI Studio (Increment B) — global owner config stored in the `settings` table.
 *
 * The owner writes Instructions + Persona once; every AI node reads them here and
 * layers them over the per-node prompt. This module is intentionally tiny and
 * fail-open: a settings read error yields the empty config, never a dropped reply.
 *
 * `storage` (and therefore `db`) is imported DYNAMICALLY inside the loader: `db.ts`
 * throws at module-load time without `DATABASE_URL`, and unit tests that import the
 * AI executor do so without a database. Deferring the import keeps the executor's
 * module graph DB-free until a real host actually loads the config.
 */

import {
  AI_STUDIO_INSTRUCTIONS_KEY,
  AI_STUDIO_PERSONA_KEY,
  DEFAULT_AI_STUDIO_CONFIG,
  EMPTY_AI_STUDIO_PERSONA,
  type AiStudioConfig,
  type AiStudioPersona,
} from '@shared/ai-defaults';

function parsePersona(raw: string | undefined | null): AiStudioPersona {
  if (!raw) return EMPTY_AI_STUDIO_PERSONA;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return EMPTY_AI_STUDIO_PERSONA;
    return {
      alias: typeof parsed.alias === 'string' ? parsed.alias : '',
      title: typeof parsed.title === 'string' ? parsed.title : '',
      description: typeof parsed.description === 'string' ? parsed.description : '',
    };
  } catch {
    return EMPTY_AI_STUDIO_PERSONA;
  }
}

/** Read the global AI Studio config. Never throws — returns defaults on error. */
export async function loadAiStudioConfig(): Promise<AiStudioConfig> {
  try {
    const { storage } = await import('../storage');
    const [instructions, personaRaw] = await Promise.all([
      storage.getSetting(AI_STUDIO_INSTRUCTIONS_KEY),
      storage.getSetting(AI_STUDIO_PERSONA_KEY),
    ]);
    return {
      instructions: instructions?.value ?? '',
      persona: parsePersona(personaRaw?.value ?? null),
    };
  } catch (error: any) {
    console.error('[AI Studio] loadAiStudioConfig failed:', error?.message || error);
    return { ...DEFAULT_AI_STUDIO_CONFIG, persona: { ...DEFAULT_AI_STUDIO_CONFIG.persona } };
  }
}
