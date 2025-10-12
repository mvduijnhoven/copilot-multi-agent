/**
 * Tool filtering service for managing agent tool access permissions
 */

import { ToolPermissions, ToolAccessError } from '../models';
import { IConfigurationManager } from './configuration-manager';

export interface ToolFilter {
  /**
   * Gets available tools for a specific agent based on their permissions
   * @param agentName The name of the agent
   * @returns Array of available tools
   */
  getAvailableTools(agentName: string): Promise<any[]>; // Will be typed as vscode.LanguageModelTool[] when available
  
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

  /**
   * Checks if an agent has access to a specific tool
   * @param agentName The name of the agent
   * @param toolName The name of the tool
   * @returns Promise resolving to true if agent has access
   */
  hasToolAccess(agentName: string, toolName: string): Promise<boolean>;
}

/**
 * Concrete implementation of the ToolFilter interface
 */
export class DefaultToolFilter implements ToolFilter {
  private configManager: IConfigurationManager;
  private allAvailableTools: any[] = []; // Will be populated with actual tools
  private customTools: Map<string, any> = new Map(); // Custom delegation tools

  constructor(configManager: IConfigurationManager) {
    this.configManager = configManager;
    this.initializeCustomTools();
  }

  /**
   * Gets available tools for a specific agent based on their permissions
   */
  async getAvailableTools(agentName: string): Promise<any[]> {
    try {
      const config = await this.configManager.loadConfiguration();
      
      let toolPermissions: ToolPermissions;
      
      if (agentName === 'coordinator') {
        toolPermissions = config.coordinator.toolPermissions;
      } else {
        const agentConfig = config.customAgents.find((agent: any) => agent.name === agentName);
        if (!agentConfig) {
          throw new ToolAccessError(
            `Agent "${agentName}" not found in configuration`,
            agentName
          );
        }
        toolPermissions = agentConfig.toolPermissions;
      }

      return this.filterTools(this.getAllTools(), toolPermissions);
    } catch (error) {
      throw new ToolAccessError(
        `Failed to get available tools for agent "${agentName}": ${error instanceof Error ? error.message : 'Unknown error'}`,
        agentName,
        { originalError: error }
      );
    }
  }

  /**
   * Filters tools based on permissions
   */
  filterTools(allTools: any[], permissions: ToolPermissions): any[] {
    switch (permissions.type) {
      case 'all':
        return [...allTools];
      
      case 'none':
        return [];
      
      case 'specific':
        if (!permissions.tools || !Array.isArray(permissions.tools)) {
          return [];
        }
        
        return allTools.filter(tool => {
          const toolName = this.getToolName(tool);
          return permissions.tools.includes(toolName);
        });
      
      default:
        // Fallback to no tools for unknown permission types
        return [];
    }
  }

  /**
   * Sets the available GitHub Copilot tools
   * This will be called when the extension initializes with actual VS Code tools
   */
  setAvailableTools(tools: any[]): void {
    this.allAvailableTools = tools || [];
    console.log(`Tool filter updated with ${this.allAvailableTools.length} GitHub Copilot tools`);
    
    // Log available tool names for debugging
    if (this.allAvailableTools.length > 0) {
      const toolNames = this.allAvailableTools.map(tool => this.getToolName(tool));
      console.log('Available GitHub Copilot tools:', toolNames.join(', '));
    }
  }

  /**
   * Adds a custom tool (like delegateWork, reportOut)
   */
  addCustomTool(name: string, tool: any): void {
    this.customTools.set(name, tool);
  }

  /**
   * Removes a custom tool
   */
  removeCustomTool(name: string): void {
    this.customTools.delete(name);
  }

  /**
   * Gets all available tools (GitHub Copilot + custom tools)
   */
  private getAllTools(): any[] {
    const customToolsArray = Array.from(this.customTools.values());
    return [...this.allAvailableTools, ...customToolsArray];
  }

  /**
   * Extracts tool name from a tool object
   */
  private getToolName(tool: any): string {
    // Handle different tool object structures
    if (typeof tool === 'string') {
      return tool;
    }
    
    if (tool && typeof tool === 'object') {
      // Try different possible property names for tool identification
      return tool.name || 
             tool.id || 
             tool.toolName || 
             tool.displayName ||
             tool.identifier ||
             (tool.metadata && tool.metadata.name) ||
             'unknown';
    }
    
    return 'unknown';
  }

  /**
   * Initializes custom delegation tools
   */
  private initializeCustomTools(): void {
    // Add placeholder custom tools - these will be replaced with actual implementations
    this.addCustomTool('delegateWork', {
      name: 'delegateWork',
      description: 'Delegate work to another specialized agent',
      parameters: {
        type: 'object',
        properties: {
          agentName: {
            type: 'string',
            description: 'Name of the agent to delegate work to'
          },
          workDescription: {
            type: 'string',
            description: 'Description of the work to be done'
          },
          reportExpectations: {
            type: 'string',
            description: 'What kind of report is expected back'
          }
        },
        required: ['agentName', 'workDescription', 'reportExpectations']
      }
    });

    this.addCustomTool('reportOut', {
      name: 'reportOut',
      description: 'Report completion of delegated work',
      parameters: {
        type: 'object',
        properties: {
          report: {
            type: 'string',
            description: 'The report content describing completed work'
          }
        },
        required: ['report']
      }
    });
  }

  /**
   * Checks if an agent has access to a specific tool
   */
  async hasToolAccess(agentName: string, toolName: string): Promise<boolean> {
    try {
      const availableTools = await this.getAvailableTools(agentName);
      return availableTools.some(tool => this.getToolName(tool) === toolName);
    } catch (error) {
      return false;
    }
  }

  /**
   * Gets tool permissions for a specific agent
   */
  async getAgentToolPermissions(agentName: string): Promise<ToolPermissions | null> {
    try {
      const config = await this.configManager.loadConfiguration();
      
      if (agentName === 'coordinator') {
        return config.coordinator.toolPermissions;
      } else {
        const agentConfig = config.customAgents.find((agent: any) => agent.name === agentName);
        return agentConfig ? agentConfig.toolPermissions : null;
      }
    } catch (error) {
      return null;
    }
  }

  /**
   * Validates tool permissions configuration
   */
  validateToolPermissions(permissions: ToolPermissions): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!permissions || typeof permissions !== 'object') {
      errors.push('Tool permissions must be an object');
      return { isValid: false, errors };
    }

    if (!['all', 'none', 'specific'].includes(permissions.type)) {
      errors.push('Tool permissions type must be "all", "none", or "specific"');
    }

    if (permissions.type === 'specific') {
      if (!permissions.tools || !Array.isArray(permissions.tools)) {
        errors.push('Specific tool permissions must include a tools array');
      } else {
        permissions.tools.forEach((tool, index) => {
          if (typeof tool !== 'string' || tool.trim().length === 0) {
            errors.push(`Tool at index ${index} must be a non-empty string`);
          }
        });
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Gets a list of all available tool names
   */
  getAllToolNames(): string[] {
    const allTools = this.getAllTools();
    return allTools.map(tool => this.getToolName(tool));
  }

  /**
   * Refreshes tool permissions for all agents (useful after configuration changes)
   */
  refreshToolPermissions(): void {
    // This method can be called when configuration changes to ensure
    // all agents have up-to-date tool access
    // Implementation depends on how we want to handle dynamic updates
  }
}