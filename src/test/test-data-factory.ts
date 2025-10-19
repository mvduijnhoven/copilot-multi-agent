/**
 * Test data factory for creating AgentExecutionContext objects and other test data
 */

import { 
  AgentExecutionContext, 
  AgentConfiguration, 
  ExtensionConfiguration,
  AgentLoopState,
  ToolInvocation,
  DelegationTarget
} from '../models';

/**
 * Options for customizing AgentExecutionContext creation
 */
export interface TestContextOptions {
  agentName?: string;
  conversationId?: string;
  parentConversationId?: string;
  systemPrompt?: string;
  availableTools?: any[];
  delegationChain?: string[];
  availableDelegationTargets?: DelegationTarget[];
  model?: any;
  conversation?: any[];
  isAgenticLoop?: boolean;
  toolInvocations?: ToolInvocation[];
  loopState?: Partial<AgentLoopState>;
}

/**
 * Test data factory for creating consistent test objects
 */
export class TestDataFactory {
  
  /**
   * Creates a basic AgentExecutionContext with all required properties
   */
  static createBasicContext(options: TestContextOptions = {}): AgentExecutionContext {
    const agentName = options.agentName || 'test-agent';
    const conversationId = options.conversationId || `${agentName}-${Date.now()}`;
    
    return {
      agentName,
      conversationId,
      parentConversationId: options.parentConversationId,
      systemPrompt: options.systemPrompt || `System prompt for ${agentName}`,
      availableTools: options.availableTools || [],
      delegationChain: options.delegationChain || [],
      availableDelegationTargets: options.availableDelegationTargets || [],
      // Agentic loop properties
      model: options.model,
      conversation: options.conversation || [],
      isAgenticLoop: options.isAgenticLoop || false,
      toolInvocations: options.toolInvocations || [],
      loopState: {
        isActive: false,
        iterationCount: 0,
        maxIterations: 50,
        hasToolInvocations: false,
        reportOutCalled: false,
        ...options.loopState
      }
    };
  }

  /**
   * Creates a coordinator agent context
   */
  static createCoordinatorContext(options: TestContextOptions = {}): AgentExecutionContext {
    return this.createBasicContext({
      agentName: 'coordinator',
      conversationId: 'coord-123',
      systemPrompt: 'You are a coordinator agent responsible for orchestrating tasks',
      ...options
    });
  }

  /**
   * Creates a delegated agent context (child agent)
   */
  static createDelegatedContext(options: TestContextOptions = {}): AgentExecutionContext {
    return this.createBasicContext({
      agentName: 'test-agent',
      conversationId: 'test-123',
      parentConversationId: 'coord-123',
      delegationChain: ['coordinator'],
      systemPrompt: 'You are a test agent',
      ...options
    });
  }

  /**
   * Creates a child agent context with delegation chain
   */
  static createChildAgentContext(
    agentName: string, 
    parentContext: AgentExecutionContext,
    options: TestContextOptions = {}
  ): AgentExecutionContext {
    return this.createBasicContext({
      agentName,
      conversationId: `${agentName}-child-${Date.now()}`,
      parentConversationId: parentContext.conversationId,
      delegationChain: [...parentContext.delegationChain, parentContext.agentName],
      ...options
    });
  }

  /**
   * Creates an agent context with agentic loop properties set up
   */
  static createAgenticLoopContext(options: TestContextOptions = {}): AgentExecutionContext {
    return this.createBasicContext({
      isAgenticLoop: true,
      model: options.model || this.createMockModel(),
      conversation: options.conversation || [
        { role: 'system', content: options.systemPrompt || 'System prompt' },
        { role: 'user', content: 'Initial message' }
      ],
      loopState: {
        isActive: true,
        iterationCount: 1,
        hasToolInvocations: true,
        ...options.loopState
      },
      ...options
    });
  }

  /**
   * Creates a mock language model for testing
   */
  static createMockModel(customBehavior?: any) {
    return {
      sendRequest: async (conversation?: any[], options?: any, token?: any) => ({
        text: 'Task completed successfully.',
        toolCalls: [{
          name: 'reportOut',
          parameters: {
            report: 'Task has been completed as requested.'
          }
        }]
      }),
      ...customBehavior
    };
  }

  /**
   * Creates a mock model that returns tool calls
   */
  static createMockModelWithTools(toolCalls: any[] = []) {
    let callCount = 0;
    return {
      sendRequest: async () => {
        callCount++;
        if (callCount === 1 && toolCalls.length > 0) {
          return {
            text: 'Using tools',
            toolCalls
          };
        } else {
          return {
            text: 'Task completed',
            toolCalls: []
          };
        }
      }
    };
  }

  /**
   * Creates a mock model that cycles through different reportOut messages
   */
  static createSequentialMockModel(messages: string[]) {
    let callCount = 0;
    return {
      sendRequest: async () => {
        const message = messages[callCount] || messages[messages.length - 1] || 'Task completed';
        callCount++;
        
        return {
          text: 'Task completed successfully.',
          toolCalls: [{
            name: 'reportOut',
            parameters: {
              report: message
            }
          }]
        };
      }
    };
  }

  /**
   * Creates a basic agent configuration
   */
  static createAgentConfig(name: string, options: Partial<AgentConfiguration> = {}): AgentConfiguration {
    return {
      name,
      systemPrompt: `You are ${name}, a specialized agent`,
      description: `${name} agent for testing`,
      useFor: 'Testing purposes',
      delegationPermissions: { type: 'all' },
      toolPermissions: { type: 'all' },
      ...options
    };
  }

  /**
   * Creates a test extension configuration
   */
  static createExtensionConfig(agents: AgentConfiguration[] = []): ExtensionConfiguration {
    const defaultAgents = agents.length > 0 ? agents : [
      this.createAgentConfig('coordinator'),
      this.createAgentConfig('test-agent')
    ];

    return {
      entryAgent: 'coordinator',
      agents: defaultAgents,
      version: '1.0.0'
    };
  }

  /**
   * Creates a tool invocation for testing
   */
  static createToolInvocation(
    toolName: string = 'testTool',
    parameters: any = { test: 'param' },
    result: any = 'Tool result',
    executionTime: number = 100
  ): ToolInvocation {
    return {
      toolName,
      parameters,
      result,
      timestamp: new Date(),
      executionTime
    };
  }

  /**
   * Creates multiple agent contexts for concurrent testing
   */
  static createMultipleAgentContexts(
    count: number,
    namePrefix: string = 'agent',
    options: TestContextOptions = {}
  ): AgentExecutionContext[] {
    return Array.from({ length: count }, (_, i) => 
      this.createBasicContext({
        agentName: `${namePrefix}-${i}`,
        conversationId: `${namePrefix}-${i}-${Date.now()}`,
        ...options
      })
    );
  }

  /**
   * Creates a delegation chain of agent contexts
   */
  static createDelegationChain(agentNames: string[]): AgentExecutionContext[] {
    const contexts: AgentExecutionContext[] = [];
    
    for (let i = 0; i < agentNames.length; i++) {
      const delegationChain = agentNames.slice(0, i);
      const parentConversationId = i > 0 ? contexts[i - 1].conversationId : undefined;
      
      contexts.push(this.createBasicContext({
        agentName: agentNames[i],
        conversationId: `${agentNames[i]}-${Date.now()}-${i}`,
        parentConversationId,
        delegationChain
      }));
    }
    
    return contexts;
  }

  /**
   * Creates a context with specific loop state for testing different loop conditions
   */
  static createLoopStateContext(
    loopState: Partial<AgentLoopState>,
    options: TestContextOptions = {}
  ): AgentExecutionContext {
    return this.createBasicContext({
      isAgenticLoop: true,
      loopState,
      ...options
    });
  }

  /**
   * Creates contexts for performance testing
   */
  static createPerformanceTestContexts(count: number = 100): AgentExecutionContext[] {
    return this.createMultipleAgentContexts(count, 'perf-agent', {
      model: this.createMockModel(),
      isAgenticLoop: true
    });
  }
}

/**
 * Mock AgentEngine that implements the full interface for testing
 */
export class MockAgentEngine {
  private contexts: Map<string, AgentExecutionContext> = new Map();
  private executionResults: Map<string, string> = new Map();
  private executionErrors: Map<string, Error> = new Map();
  private executionDelays: Map<string, number> = new Map();

  async initializeAgent(
    config: AgentConfiguration, 
    extensionConfig?: ExtensionConfiguration,
    model?: any
  ): Promise<AgentExecutionContext> {
    const context = TestDataFactory.createBasicContext({
      agentName: config.name,
      systemPrompt: config.systemPrompt,
      model: model || TestDataFactory.createMockModel()
    });
    
    this.contexts.set(config.name, context);
    return context;
  }

  async executeAgent(context: AgentExecutionContext, input: string): Promise<string> {
    const error = this.executionErrors.get(context.agentName);
    if (error) {
      throw error;
    }
    
    const result = this.executionResults.get(context.agentName) || 
                  `Agent ${context.agentName} processed: ${input}`;
    return result;
  }

  async executeAgenticLoop(
    context: AgentExecutionContext,
    initialMessage: string,
    tools: any[],
    token?: any
  ): Promise<any> {
    return {
      finalResponse: `Mock agentic loop response for ${context.agentName}`,
      toolInvocations: [],
      conversationHistory: [],
      completed: true,
      iterationCount: 1
    };
  }

  async handleDelegatedRequest(
    context: AgentExecutionContext,
    delegatedWork: string,
    tools: any[],
    token?: any
  ): Promise<string> {
    const delay = this.executionDelays.get(context.agentName);
    if (delay) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    const error = this.executionErrors.get(context.agentName);
    if (error) {
      throw error;
    }
    
    const result = this.executionResults.get(context.agentName);
    if (result) {
      return result;
    }
    
    return `Mock delegated response for ${context.agentName}: ${delegatedWork}`;
  }

  getAgentContext(agentName: string): AgentExecutionContext | undefined {
    return this.contexts.get(agentName);
  }

  terminateAgent(agentName: string): void {
    this.contexts.delete(agentName);
  }

  getActiveAgents(): AgentExecutionContext[] {
    return Array.from(this.contexts.values());
  }

  // Additional methods that might be called by delegation engine
  async initializeChildAgent(
    config: AgentConfiguration, 
    parentContext: AgentExecutionContext, 
    extensionConfig?: ExtensionConfiguration
  ): Promise<AgentExecutionContext> {
    const childContext = TestDataFactory.createDelegatedContext({
      agentName: config.name,
      conversationId: `${config.name}-child-${Date.now()}`,
      parentConversationId: parentContext.conversationId,
      systemPrompt: config.systemPrompt,
      delegationChain: [...parentContext.delegationChain, parentContext.agentName],
      model: parentContext.model
    });
    
    // Store with the agent name as key so reportOut can find it
    this.contexts.set(config.name, childContext);
    return childContext;
  }

  // Test helper methods
  setMockContext(agentName: string, context: AgentExecutionContext): void {
    this.contexts.set(agentName, context);
  }

  setExecutionResult(agentName: string, result: string): void {
    this.executionResults.set(agentName, result);
  }

  setExecutionError(agentName: string, error: Error): void {
    this.executionErrors.set(agentName, error);
  }

  setExecutionDelay(agentName: string, delayMs: number): void {
    this.executionDelays.set(agentName, delayMs);
  }

  clearMocks(): void {
    this.contexts.clear();
    this.executionResults.clear();
    this.executionErrors.clear();
    this.executionDelays.clear();
  }
}