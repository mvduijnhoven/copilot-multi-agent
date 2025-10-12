/**
 * Core interfaces for agent configuration and management
 */

export interface AgentConfiguration {
  name: string;
  systemPrompt: string;
  description: string;
  useFor: string;
  delegationPermissions: DelegationPermissions;
  toolPermissions: ToolPermissions;
}

export interface CoordinatorConfiguration extends Omit<AgentConfiguration, 'name'> {
  name: 'coordinator';
}

export type DelegationPermissions = 
  | { type: 'all' }
  | { type: 'none' }
  | { type: 'specific'; agents: string[] };

export type ToolPermissions = 
  | { type: 'all' }
  | { type: 'none' }
  | { type: 'specific'; tools: string[] };

export interface ExtensionConfiguration {
  coordinator: CoordinatorConfiguration;
  customAgents: AgentConfiguration[];
}

export interface AgentExecutionContext {
  agentName: string;
  conversationId: string;
  parentConversationId?: string;
  systemPrompt: string;
  availableTools: any[]; // Will be typed as vscode.LanguageModelTool[] when available
  delegationChain: string[];
}