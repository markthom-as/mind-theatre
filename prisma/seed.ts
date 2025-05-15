import { PrismaClient } from '@prisma/client';
import { Prisma } from '../node_modules/.prisma/client';

import fs from 'fs';
import yaml from 'js-yaml';
import path from 'path';

const prisma = new PrismaClient();

interface AgentFromYaml {
  name: string;
  prompt: string;
  llm_params?: Record<string, any>;
  // color is not in prompts.yaml
  color?: string;
}

interface PromptsYaml {
  agents: AgentFromYaml[];
  // other top-level keys like synthesiser_prompt might exist
}

async function main() {
  console.log(`Start seeding ...`);

  try {
    // Construct path to prompts.yaml relative to the prisma directory
    const promptsPath = path.join(__dirname, '../prompts.yaml');
    const promptsFile = fs.readFileSync(promptsPath, 'utf8');
    const loadedPrompts = yaml.load(promptsFile) as PromptsYaml;

    if (!loadedPrompts || !loadedPrompts.agents) {
      console.error('Could not load agents from prompts.yaml or it has an unexpected structure.');
      process.exit(1);
    }

    for (const agentConfig of loadedPrompts.agents) {
      const agentData: Prisma.AgentCreateInput = {
        name: agentConfig.name,
        prompt: agentConfig.prompt,
        color: agentConfig.color,
        llmParams: agentConfig.llm_params ? agentConfig.llm_params as Prisma.InputJsonValue : undefined,
      };

      const agent = await prisma.agent.upsert({
        where: { name: agentConfig.name },
        update: {
          prompt: agentConfig.prompt,
          color: agentConfig.color,
          llmParams: agentConfig.llm_params ? agentConfig.llm_params as Prisma.InputJsonValue : undefined,
        },
        create: agentData,
      });
      console.log(`Created or updated agent: ${agent.name} (ID: ${agent.id})`);
    }
  } catch (e) {
    console.error('Error during seeding process:', e);
    process.exit(1); // Exit if YAML loading or main seeding logic fails
  }

  console.log(`Seeding finished.`);
}

main()
  .catch((e) => {
    console.error('Unhandled error in main:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  }); 