/**
 * Constants and default values for the multi-agent extension
 */

import { ExtensionConfiguration } from './models';

export const EXTENSION_ID = 'copilot-multi-agent';
export const CHAT_PARTICIPANT_ID = 'copilot-multi-agent.entry-agent';
export const CHAT_PARTICIPANT_NAME = 'multi-agent';

export const CONFIGURATION_SECTION = 'copilotMultiAgent';

export const DEFAULT_COORDINATOR_CONFIG = {
  name: 'coordinator',
  systemPrompt: 'You are a coordinator agent that helps orchestrate work between specialized agents. You can delegate tasks to other agents when appropriate using the delegateWork tool. When you receive reports from other agents via reportOut, incorporate their findings into your response.',
  description: 'Coordinates work between specialized agents',
  useFor: 'Task orchestration and delegation',
  delegationPermissions: { type: 'all' as const },
  toolPermissions: { type: 'all' as const }
};

export const DEFAULT_EXTENSION_CONFIG: ExtensionConfiguration = {
  entryAgent: 'coordinator',
  agents: [DEFAULT_COORDINATOR_CONFIG]
};

export const DELEGATION_TOOLS = {
  DELEGATE_WORK: 'delegateWork',
  REPORT_OUT: 'reportOut'
} as const;

export const MAX_DELEGATION_DEPTH = 5;
export const CONVERSATION_TIMEOUT_MS = 300000; // 5 minutes