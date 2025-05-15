import fs from 'fs';
import yaml from 'js-yaml';
import path from 'path';

export interface AgentConfig {
  name: string;
  prompt: string;
  llm_params?: Record<string, any>;
  color?: string; // Added for convenience
}

// Added interface for raw agent structure from YAML
interface RawAgentFromYaml {
  name: string;
  prompt: string;
  llm_params?: Record<string, any>;
}

export interface PromptsConfig {
  agents: AgentConfig[];
  synthesiser_prompt: string;
  llm_params: Record<string, any>; // Synthesiser LLM params
}

// Agent color mapping, similar to the Python version
const AGENT_COLORS: Record<string, string> = {
  "Id": "red",
  "Eros (Life Drive)": "deepPink",
  "Thanatos (Death Drive)": "darkSlateBlue",
  "Ego": "green",
  "Defence Manager": "darkGoldenRod",
  "Conscience": "orange",
  "Ego-Ideal": "purple",
  "Imaginary Register": "teal",
  "Symbolic Register": "saddleBrown",
  "Real Register": "gray",
  "objet petit a": "olive",
  "Sinthome": "maroon",
  "Discourse of the Master (S1 → S2)": "navy",
  "Discourse of the University (S2 → a)": "darkCyan",
  "Discourse of the Hysteric ($ → S1)": "crimson",
  "Discourse of the Analyst (a → $)": "darkSlateGray",
  "System": "black", // For system messages in dialogue
  "Psyche": "magenta", // For the final synthesised response
};

let loadedConfig: PromptsConfig | null = null;

export function getPromptsConfig(): PromptsConfig {
  if (loadedConfig) {
    return loadedConfig;
  }

  try {
    // prompts.yaml is expected to be at the root of the project (mind-theatre/prompts.yaml)
    const filePath = path.join(process.cwd(), 'prompts.yaml');
    const fileContents = fs.readFileSync(filePath, 'utf8');
    const data = yaml.load(fileContents) as any; 

    if (!data || !data.agents || !Array.isArray(data.agents)) {
      throw new Error('Invalid prompts.yaml structure: "agents" array not found.');
    }
    if (!data.synthesiser_prompt || typeof data.synthesiser_prompt !== 'string') {
      throw new Error('Invalid prompts.yaml structure: "synthesiser_prompt" not found or not a string.');
    }
     if (!data.llm_params || typeof data.llm_params !== 'object') {
      throw new Error('Invalid prompts.yaml structure: "llm_params" for synthesiser not found or not an object.');
    }

    const agentsWithColors: AgentConfig[] = data.agents.map((agent: RawAgentFromYaml) => {
      if (!agent.name || typeof agent.name !== 'string') {
        // console.warn('Agent in prompts.yaml is missing a name or name is not a string:', agent);
        return null; 
      }
      return {
        name: agent.name,
        prompt: agent.prompt,
        llm_params: agent.llm_params || {},
        color: AGENT_COLORS[agent.name] || 'grey',
      };
    }).filter((agent: AgentConfig | null): agent is AgentConfig => agent !== null);

    loadedConfig = {
        agents: agentsWithColors,
        synthesiser_prompt: data.synthesiser_prompt,
        llm_params: data.llm_params
    };
    return loadedConfig;
  } catch (error) {
    console.error("Error loading or parsing mind-theatre/prompts.yaml:", error);
    return {
        agents: [],
        synthesiser_prompt: "",
        llm_params: {}
    };
  }
}

export function getAgents(): AgentConfig[] {
  const config = getPromptsConfig();
  return config.agents;
}

export function getAgentNames(): string[] {
  const config = getPromptsConfig();
  return config.agents.map(agent => agent.name);
}

export function getAgentColors(): Record<string, string> {
    const agents = getPromptsConfig().agents;
    const colors: Record<string, string> = {};
    agents.forEach(agent => {
        if(agent.color) { 
            colors[agent.name] = agent.color;
        }
    });
    return colors;
} 