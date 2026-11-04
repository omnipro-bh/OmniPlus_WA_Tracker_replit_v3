/**
 * Shared AI Agent prompt defaults.
 *
 * These strings are shown in the owner-facing node config (as the System Prompt
 * placeholder) and appended automatically by `server/ai/prompt.ts`, so the
 * "don't re-send the menu after a click" rule is present even when the owner
 * never edits the prompt.
 *
 * The runtime guard in `aiAgentExecutor.ts` is the enforcement layer: on a
 * detected option click the option tools are physically removed from the
 * request, so the model cannot loop even if it ignores these instructions.
 */

/**
 * The option-tool rules. Appended to every AI node that declares buttons or
 * list rows.
 */
export const AI_TOOL_RULES = [
  'TOOLS AVAILABLE:',
  '- send_buttons: Present 1–3 options as buttons.',
  '- send_list: Present 4–10 options as a list.',
  '- handover: Hand off to a human agent.',
  '',
  'RULES:',
  '1. Use send_buttons or send_list ONLY when asking the user to choose from options.',
  '2. If the user CLICKS a button (their message is a button title like "See pricing"), do NOT send buttons again. Answer their question with TEXT.',
  '3. Never send buttons for options the user has already chosen.',
].join('\n');

/** Default content offered in the node config's System Prompt field. */
export const AI_DEFAULT_SYSTEM_PROMPT = ['You are a helpful assistant.', '', AI_TOOL_RULES].join(
  '\n'
);
