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
  aiLeadsColumnsKey,
  aiLeadsTabKey,
  aiStudioInstructionsKey,
  aiStudioObjectivesKey,
  aiStudioPersonaKey,
  DEFAULT_AI_STUDIO_CONFIG,
  DEFAULT_LEADS_COLUMNS,
  DEFAULT_LEADS_TAB,
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

function parseObjectives(raw: string | undefined | null): string[] {
  if (!raw) return DEFAULT_AI_STUDIO_CONFIG.objectives;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_AI_STUDIO_CONFIG.objectives;
    return parsed.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
  } catch {
    return DEFAULT_AI_STUDIO_CONFIG.objectives;
  }
}

/** Read the AI Studio config for a specific workflow. Never throws — returns defaults on error. */
export async function loadAiStudioConfig(workflowId: number): Promise<AiStudioConfig> {
  try {
    const { storage } = await import('../storage');
    const [instructions, personaRaw, objectivesRaw, leadsTabRaw, leadsColumnsRaw] = await Promise.all([
      storage.getSetting(aiStudioInstructionsKey(workflowId)),
      storage.getSetting(aiStudioPersonaKey(workflowId)),
      storage.getSetting(aiStudioObjectivesKey(workflowId)),
      storage.getSetting(aiLeadsTabKey(workflowId)),
      storage.getSetting(aiLeadsColumnsKey(workflowId)),
    ]);
    return {
      instructions: instructions?.value ?? '',
      persona: parsePersona(personaRaw?.value ?? null),
      objectives: parseObjectives(objectivesRaw?.value),
      leadsTab: (leadsTabRaw?.value ?? '').trim() || DEFAULT_LEADS_TAB,
      leadsColumns: (leadsColumnsRaw?.value ?? '').trim() || DEFAULT_LEADS_COLUMNS,
    };
  } catch (error: any) {
    console.error('[AI Studio] loadAiStudioConfig failed:', error?.message || error);
    return { ...DEFAULT_AI_STUDIO_CONFIG, persona: { ...DEFAULT_AI_STUDIO_CONFIG.persona } };
  }
}
