/**
 * Interface for the delegateWork custom tool
 */

export interface DelegateWorkTool {
  /**
   * The name of the tool
   */
  readonly name: string;
  
  /**
   * Description of what the tool does
   */
  readonly description: string;
  
  /**
   * Parameter schema for the tool
   */
  readonly parametersSchema: any; // Will be typed appropriately when VS Code types are available
  
  /**
   * Invokes the delegateWork tool
   * @param parameters The tool parameters
   * @param token Cancellation token
   * @returns Promise resolving to tool result
   */
  invoke(parameters: DelegateWorkParameters, token: any): Promise<any>;
}

export interface DelegateWorkParameters {
  agentName: string;
  workDescription: string;
  reportExpectations: string;
}