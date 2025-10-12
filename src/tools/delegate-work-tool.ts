import * as vscode from 'vscode';
import { DelegationEngine } from '../models/delegation-engine';

/**
 * Parameters for the delegateWork tool
 */
export interface DelegateWorkParameters {
  agentName: string;
  workDescription: string;
  reportExpectations: string;
}

/**
 * Custom tool that allows agents to delegate work to other specialized agents
 */
export class DelegateWorkTool implements vscode.LanguageModelTool<DelegateWorkParameters> {
  readonly name = 'delegateWork';
  readonly description = 'Delegate work to a specialized agent. Use this when a task requires expertise from a specific agent or when breaking down complex work into specialized components.';
  
  readonly parametersSchema = {
    type: 'object',
    properties: {
      agentName: {
        type: 'string',
        description: 'The name of the agent to delegate work to. Must be a configured agent name.',
        minLength: 1,
        maxLength: 50,
        pattern: '^[a-zA-Z0-9-_]+$'
      },
      workDescription: {
        type: 'string',
        description: 'Detailed description of the work to be delegated. Be specific about what needs to be done.',
        minLength: 10,
        maxLength: 2000
      },
      reportExpectations: {
        type: 'string',
        description: 'Description of what kind of report or output is expected from the delegated agent.',
        minLength: 5,
        maxLength: 500
      }
    },
    required: ['agentName', 'workDescription', 'reportExpectations'],
    additionalProperties: false
  };

  constructor(
    private delegationEngine: DelegationEngine,
    private currentAgentName: string
  ) {}

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<DelegateWorkParameters>,
    token: vscode.CancellationToken
  ): Promise<vscode.LanguageModelToolResult> {
    try {
      // Extract parameters from options - the exact structure may vary based on VS Code API version
      const parameters = (options as any).parameters || options;
      
      // Validate parameters
      this.validateParameters(parameters);
      
      // Check if delegation is allowed
      if (!this.delegationEngine.isValidDelegation(this.currentAgentName, parameters.agentName)) {
        throw new Error(`Delegation from '${this.currentAgentName}' to '${parameters.agentName}' is not allowed. Check delegation permissions.`);
      }

      // Check for cancellation before starting delegation
      if (token.isCancellationRequested) {
        throw new vscode.CancellationError();
      }

      // Delegate the work
      const report = await this.delegationEngine.delegateWork(
        this.currentAgentName,
        parameters.agentName,
        parameters.workDescription,
        parameters.reportExpectations
      );

      // Check for cancellation after delegation
      if (token.isCancellationRequested) {
        throw new vscode.CancellationError();
      }

      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(`Work delegation completed successfully. Agent '${parameters.agentName}' has provided the following report:\n\n${report}`)
      ]);

    } catch (error) {
      if (error instanceof vscode.CancellationError) {
        throw error;
      }

      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred during delegation';
      
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(`Delegation failed: ${errorMessage}`)
      ]);
    }
  }

  /**
   * Validates the parameters for the delegateWork tool
   * @param parameters The parameters to validate
   * @throws Error if parameters are invalid
   */
  private validateParameters(parameters: DelegateWorkParameters): void {
    if (!parameters.agentName || typeof parameters.agentName !== 'string') {
      throw new Error('agentName is required and must be a non-empty string');
    }

    if (parameters.agentName.length > 50 || !/^[a-zA-Z0-9-_]+$/.test(parameters.agentName)) {
      throw new Error('agentName must be 1-50 characters and contain only letters, numbers, hyphens, and underscores');
    }

    if (!parameters.workDescription || typeof parameters.workDescription !== 'string') {
      throw new Error('workDescription is required and must be a non-empty string');
    }

    if (parameters.workDescription.length < 10 || parameters.workDescription.length > 2000) {
      throw new Error('workDescription must be between 10 and 2000 characters');
    }

    if (!parameters.reportExpectations || typeof parameters.reportExpectations !== 'string') {
      throw new Error('reportExpectations is required and must be a non-empty string');
    }

    if (parameters.reportExpectations.length < 5 || parameters.reportExpectations.length > 500) {
      throw new Error('reportExpectations must be between 5 and 500 characters');
    }

    // Prevent self-delegation
    if (parameters.agentName === this.currentAgentName) {
      throw new Error('An agent cannot delegate work to itself');
    }
  }
}