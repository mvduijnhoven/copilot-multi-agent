/**
 * Interface for chat participant service
 */

export interface MultiAgentChatParticipant {
  /**
   * The unique identifier for this chat participant
   */
  readonly id: string;
  
  /**
   * Optional icon path for the chat participant
   */
  readonly iconPath?: any; // Will be typed as vscode.Uri when available
  
  /**
   * Handles incoming chat requests
   * @param request The chat request
   * @param context The chat context
   * @param stream The response stream
   * @param token Cancellation token
   * @returns Promise resolving to chat result
   */
  handleRequest(
    request: any, // Will be typed as vscode.ChatRequest when available
    context: any, // Will be typed as vscode.ChatContext when available
    stream: any, // Will be typed as vscode.ChatResponseStream when available
    token: any // Will be typed as vscode.CancellationToken when available
  ): Promise<any>; // Will be typed as vscode.ChatResult when available
  
  /**
   * Registers the chat participant with VS Code
   */
  register(): void;
  
  /**
   * Disposes of the chat participant
   */
  dispose(): void;
}