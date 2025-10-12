/**
 * Interfaces for tool filtering and access control
 */

import { ToolPermissions } from './agent-configuration';

export interface ToolFilter {
  /**
   * Gets available tools for a specific agent based on their permissions
   * @param agentName The name of the agent
   * @returns Array of available tools
   */
  getAvailableTools(agentName: string): any[]; // Will be typed as vscode.LanguageModelTool[] when available
  
  /**
   * Filters tools based on permissions
   * @param allTools All available tools
   * @param permissions The tool permissions to apply
   * @returns Filtered array of tools
   */
  filterTools(
    allTools: any[], // Will be typed as vscode.LanguageModelTool[] when available
    permissions: ToolPermissions
  ): any[]; // Will be typed as vscode.LanguageModelTool[] when available
}

export interface ToolAccessRequest {
  agentName: string;
  toolName: string;
  timestamp: Date;
}

export interface ToolAccessResult {
  allowed: boolean;
  reason?: string;
}