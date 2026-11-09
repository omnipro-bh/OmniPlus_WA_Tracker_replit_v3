/**
 * Migration: copy per-node `systemPrompt` from AI Agent workflow nodes into the
 * workflow-scoped AI Studio Instructions setting (`ai_studio_instructions_wf_<id>`).
 *
 * Run once before deploying the code that removes `systemPrompt` from the node
 * config, so existing workflows don't lose their custom instructions.
 *
 *   cd /opt/omniplus && npx tsx scripts/migrate-system-prompt-to-settings.ts
 */
import 'dotenv/config';
import { storage } from '../server/storage';
import type { Workflow, Node } from '@shared/schema';

function findAiAgentNodes(definitionJson: any): { nodeId: string; systemPrompt?: string }[] {
  const nodes: Node[] = Array.isArray(definitionJson?.nodes) ? definitionJson.nodes : [];
  const results: { nodeId: string; systemPrompt?: string }[] = [];
  for (const node of nodes) {
    const nodeType = node?.data?.type || node?.data?.nodeType;
    if (nodeType === 'action.ai_agent') {
      const systemPrompt = node?.data?.config?.systemPrompt;
      if (systemPrompt && typeof systemPrompt === 'string' && systemPrompt.trim()) {
        results.push({ nodeId: String(node.id), systemPrompt: systemPrompt.trim() });
      }
    }
  }
  return results;
}

async function main() {
  const workflows: Workflow[] = await storage.getAllWorkflows();
  console.log(`Found ${workflows.length} workflow(s).`);

  let migrated = 0;
  let skipped = 0;

  for (const wf of workflows) {
    const def: any = wf.definitionJson ?? {};
    const aiNodes = findAiAgentNodes(def);
    for (const node of aiNodes) {
      const key = `ai_studio_instructions_wf_${wf.id}`;
      const existing = await storage.getSetting(key);
      if (existing?.value) {
        console.log(`  [skip] workflow ${wf.id} "${wf.name}" node ${node.nodeId}: instructions already set`);
        skipped++;
        continue;
      }
      await storage.setSetting(key, node.systemPrompt);
      console.log(`  [migrated] workflow ${wf.id} "${wf.name}" node ${node.nodeId}: systemPrompt → settings.${key}`);
      migrated++;
    }
  }

  console.log(`\nMigration complete: ${migrated} migrated, ${skipped} skipped (already set).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
