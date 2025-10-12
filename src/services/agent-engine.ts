/**
 * Interface for agent engine service
 */

import { AgentConfiguration, AgentExecutionContext } from '../models';

export interface AgentEngine {
  /**
   * Initializes an agent with its configuration
   * @param config The agent configuration
   * @returns The agent execution context
   */
  initializeAgent(config: AgentConfiguration): Promise<AgentExecutionContext>;
  
  /**
   * Executes an agent with the given context and input
   * @param context The agent execution context
   * @param input The input message or request
   * @returns Promise resolving to the agent's response
   */
  executeAgent(context: AgentExecutionContext, input: string): Promise<string>;
  
  /**
   * Gets an agent's execution context by name
   * @param agentName The name of the agent
   * @returns The agent's execution context if found
   */
  getAgentContext(agentName: string): AgentExecutionContext | undefined;
  
  /**
   * Terminates an agent's execution
   * @param agentName The name of the agent to terminate
   */
  terminateAgent(agentName: string): void;
  
  /**
   * Lists all active agent contexts
   * @returns Array of active agent execution contexts
   */
  getActiveAgents(): AgentExecutionContext[];
}