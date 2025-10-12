import * as assert from 'assert';
import * as vscode from 'vscode';
import { DelegateWorkTool, DelegateWorkParameters } from '../tools/delegate-work-tool';
import { DelegationEngine } from '../models/delegation-engine';

// Mock implementation of DelegationEngine for testing
class MockDelegationEngine implements DelegationEngine {
  private validDelegations: Map<string, string[]> = new Map();
  private delegationResults: Map<string, string> = new Map();

  setValidDelegations(fromAgent: string, toAgents: string[]): void {
    this.validDelegations.set(fromAgent, toAgents);
  }

  setDelegationResult(toAgent: string, result: string): void {
    this.delegationResults.set(toAgent, result);
  }

  async delegateWork(
    fromAgent: string,
    toAgent: string,
    workDescription: string,
    reportExpectations: string
  ): Promise<string> {
    const result = this.delegationResults.get(toAgent);
    if (!result) {
      throw new Error(`No result configured for agent: ${toAgent}`);
    }
    return result;
  }

  reportOut(agentName: string, report: string): void {
    // Mock implementation - no-op for testing
  }

  async isValidDelegation(fromAgent: string, toAgent: string): Promise<boolean> {
    const allowedAgents = this.validDelegations.get(fromAgent);
    return allowedAgents ? allowedAgents.includes(toAgent) : false;
  }
}

// Mock CancellationToken for testing
class MockCancellationToken implements vscode.CancellationToken {
  private _isCancellationRequested = false;
  private _onCancellationRequestedEmitter = new vscode.EventEmitter<any>();

  get isCancellationRequested(): boolean {
    return this._isCancellationRequested;
  }

  get onCancellationRequested(): vscode.Event<any> {
    return this._onCancellationRequestedEmitter.event;
  }

  cancel(): void {
    this._isCancellationRequested = true;
    this._onCancellationRequestedEmitter.fire({});
  }
}

suite('DelegateWorkTool Tests', () => {
  let mockDelegationEngine: MockDelegationEngine;
  let delegateWorkTool: DelegateWorkTool;
  let mockToken: MockCancellationToken;

  setup(() => {
    mockDelegationEngine = new MockDelegationEngine();
    
    // Create mock system prompt builder
    const mockSystemPromptBuilder = {
      getEnumeratedAgentNames: () => ['test-agent', 'code-reviewer']
    };
    
    // Create mock configuration
    const mockConfiguration = {
      coordinator: {
        name: 'coordinator',
        systemPrompt: 'Test prompt',
        description: 'Test description',
        useFor: 'Testing',
        delegationPermissions: { type: 'all' },
        toolPermissions: { type: 'all' }
      },
      customAgents: []
    };
    
    delegateWorkTool = new DelegateWorkTool(
      mockDelegationEngine, 
      'coordinator',
      mockSystemPromptBuilder as any,
      mockConfiguration as any
    );
    mockToken = new MockCancellationToken();
  });

  test('should have correct tool metadata', () => {
    assert.strictEqual(delegateWorkTool.name, 'delegateWork');
    assert.ok(delegateWorkTool.description.length > 0);
    assert.ok(delegateWorkTool.parametersSchema);
    assert.strictEqual(delegateWorkTool.parametersSchema.type, 'object');
    assert.ok(delegateWorkTool.parametersSchema.properties);
    assert.ok(delegateWorkTool.parametersSchema.required);
  });

  test('should validate required parameters', async () => {
    const invalidParameters = [
      { agentName: '', workDescription: 'test work', reportExpectations: 'test report' },
      { agentName: 'test-agent', workDescription: '', reportExpectations: 'test report' },
      { agentName: 'test-agent', workDescription: 'test work', reportExpectations: '' },
      { workDescription: 'test work', reportExpectations: 'test report' }, // missing agentName
    ];

    for (const params of invalidParameters) {
      const options = { parameters: params as DelegateWorkParameters } as any;
      const result = await delegateWorkTool.invoke(options, mockToken);
      assert.ok(result instanceof vscode.LanguageModelToolResult);
      assert.ok(result.content[0] instanceof vscode.LanguageModelTextPart);
      const content = (result.content[0] as vscode.LanguageModelTextPart).value;
      assert.ok(content.includes('Delegation failed:'));
    }
  });

  test('should validate parameter lengths and formats', async () => {
    const invalidParameters = [
      { 
        agentName: 'a'.repeat(51), // too long
        workDescription: 'test work description',
        reportExpectations: 'test report'
      },
      { 
        agentName: 'invalid@name', // invalid characters
        workDescription: 'test work description',
        reportExpectations: 'test report'
      },
      { 
        agentName: 'test-agent',
        workDescription: 'short', // too short
        reportExpectations: 'test report'
      },
      { 
        agentName: 'test-agent',
        workDescription: 'a'.repeat(2001), // too long
        reportExpectations: 'test report'
      },
      { 
        agentName: 'test-agent',
        workDescription: 'test work description',
        reportExpectations: 'abc' // too short
      },
      { 
        agentName: 'test-agent',
        workDescription: 'test work description',
        reportExpectations: 'a'.repeat(501) // too long
      }
    ];

    for (const params of invalidParameters) {
      const options = { parameters: params } as any;
      const result = await delegateWorkTool.invoke(options, mockToken);
      assert.ok(result instanceof vscode.LanguageModelToolResult);
      assert.ok(result.content[0] instanceof vscode.LanguageModelTextPart);
      const content = (result.content[0] as vscode.LanguageModelTextPart).value;
      assert.ok(content.includes('Delegation failed:'));
    }
  });

  test('should prevent self-delegation', async () => {
    const params: DelegateWorkParameters = {
      agentName: 'coordinator', // same as current agent
      workDescription: 'test work description',
      reportExpectations: 'test report expectations'
    };

    const options = { parameters: params } as any;
    const result = await delegateWorkTool.invoke(options, mockToken);
    assert.ok(result instanceof vscode.LanguageModelToolResult);
    assert.ok(result.content[0] instanceof vscode.LanguageModelTextPart);
    const content = (result.content[0] as vscode.LanguageModelTextPart).value;
    assert.ok(content.includes('Delegation failed:'));
    assert.ok(content.includes('cannot delegate work to itself'));
  });

  test('should check delegation permissions', async () => {
    // Set up mock to disallow delegation to 'test-agent'
    mockDelegationEngine.setValidDelegations('coordinator', ['other-agent']);

    const params: DelegateWorkParameters = {
      agentName: 'test-agent',
      workDescription: 'test work description',
      reportExpectations: 'test report expectations'
    };

    const options = { parameters: params } as any;
    const result = await delegateWorkTool.invoke(options, mockToken);
    assert.ok(result instanceof vscode.LanguageModelToolResult);
    assert.ok(result.content[0] instanceof vscode.LanguageModelTextPart);
    const content = (result.content[0] as vscode.LanguageModelTextPart).value;
    assert.ok(content.includes('Delegation failed:'));
    assert.ok(content.includes('not allowed'));
  });

  test('should successfully delegate work when valid', async () => {
    // Set up mock for successful delegation
    mockDelegationEngine.setValidDelegations('coordinator', ['test-agent']);
    mockDelegationEngine.setDelegationResult('test-agent', 'Task completed successfully');

    const params: DelegateWorkParameters = {
      agentName: 'test-agent',
      workDescription: 'test work description that is long enough',
      reportExpectations: 'detailed report expected'
    };

    const options = { parameters: params } as any;
    const result = await delegateWorkTool.invoke(options, mockToken);
    assert.ok(result instanceof vscode.LanguageModelToolResult);
    assert.ok(result.content[0] instanceof vscode.LanguageModelTextPart);
    const content = (result.content[0] as vscode.LanguageModelTextPart).value;
    assert.ok(content.includes('Work delegation completed successfully'));
    assert.ok(content.includes('Task completed successfully'));
  });

  test('should handle cancellation during delegation', async () => {
    // Set up mock for successful delegation
    mockDelegationEngine.setValidDelegations('coordinator', ['test-agent']);
    mockDelegationEngine.setDelegationResult('test-agent', 'Task completed');

    const params: DelegateWorkParameters = {
      agentName: 'test-agent',
      workDescription: 'test work description that is long enough',
      reportExpectations: 'detailed report expected'
    };

    // Cancel the token before invoking
    mockToken.cancel();

    try {
      const options = { parameters: params } as any;
      await delegateWorkTool.invoke(options, mockToken);
      assert.fail('Expected CancellationError to be thrown');
    } catch (error) {
      assert.ok(error instanceof vscode.CancellationError);
    }
  });

  test('should handle delegation engine errors', async () => {
    // Set up mock to allow delegation but throw error during execution
    mockDelegationEngine.setValidDelegations('coordinator', ['test-agent']);
    // Don't set delegation result, which will cause an error

    const params: DelegateWorkParameters = {
      agentName: 'test-agent',
      workDescription: 'test work description that is long enough',
      reportExpectations: 'detailed report expected'
    };

    const options = { parameters: params } as any;
    const result = await delegateWorkTool.invoke(options, mockToken);
    assert.ok(result instanceof vscode.LanguageModelToolResult);
    assert.ok(result.content[0] instanceof vscode.LanguageModelTextPart);
    const content = (result.content[0] as vscode.LanguageModelTextPart).value;
    assert.ok(content.includes('Delegation failed:'));
  });

  test('should validate parameter schema structure', () => {
    const schema = delegateWorkTool.parametersSchema;
    
    // Check required properties exist
    assert.ok(schema.properties.agentName);
    assert.ok(schema.properties.workDescription);
    assert.ok(schema.properties.reportExpectations);
    
    // Check required array
    assert.deepStrictEqual(schema.required, ['agentName', 'workDescription', 'reportExpectations']);
    
    // Check agentName constraints
    assert.strictEqual(schema.properties.agentName.type, 'string');
    assert.strictEqual(schema.properties.agentName.minLength, 1);
    assert.strictEqual(schema.properties.agentName.maxLength, 50);
    assert.ok(schema.properties.agentName.pattern);
    
    // Check workDescription constraints
    assert.strictEqual(schema.properties.workDescription.type, 'string');
    assert.strictEqual(schema.properties.workDescription.minLength, 10);
    assert.strictEqual(schema.properties.workDescription.maxLength, 2000);
    
    // Check reportExpectations constraints
    assert.strictEqual(schema.properties.reportExpectations.type, 'string');
    assert.strictEqual(schema.properties.reportExpectations.minLength, 5);
    assert.strictEqual(schema.properties.reportExpectations.maxLength, 500);
  });
});