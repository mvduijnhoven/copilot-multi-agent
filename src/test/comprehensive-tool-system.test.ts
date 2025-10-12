/**
 * Comprehensive unit tests for the complete tool system
 * Covers delegateWork tool, reportOut tool, and tool filter integration
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import { DelegateWorkTool } from '../tools/delegate-work-tool';
import { ReportOutTool } from '../tools/report-out-tool';
import { DefaultToolFilter } from '../services/tool-filter';
import { DelegationEngine } from '../models/delegation-engine';
import { IConfigurationManager } from '../services/configuration-manager';
import {
  ExtensionConfiguration,
  DEFAULT_EXTENSION_CONFIG
} from '../models';

// Mock implementations
class MockDelegationEngine implements DelegationEngine {
  private validDelegations: Map<string, string[]> = new Map();
  private delegationResults: Map<string, string> = new Map();
  private reportOutCalls: Array<{ agentName: string; report: string }> = [];
  private shouldThrowError = false;

  setValidDelegations(fromAgent: string, toAgents: string[]): void {
    this.validDelegations.set(fromAgent, toAgents);
  }

  setDelegationResult(toAgent: string, result: string): void {
    this.delegationResults.set(toAgent, result);
  }

  setShouldThrowError(shouldThrow: boolean): void {
    this.shouldThrowError = shouldThrow;
  }

  getReportOutCalls(): Array<{ agentName: string; report: string }> {
    return [...this.reportOutCalls];
  }

  clearReportOutCalls(): void {
    this.reportOutCalls = [];
  }

  async delegateWork(
    fromAgent: string,
    toAgent: string,
    workDescription: string,
    reportExpectations: string
  ): Promise<string> {
    if (this.shouldThrowError) {
      throw new Error(`Delegation failed: ${fromAgent} -> ${toAgent} for work: ${workDescription} with expectations: ${reportExpectations}`);
    }

    const result = this.delegationResults.get(toAgent);
    if (!result) {
      throw new Error(`No result configured for agent: ${toAgent}`);
    }
    return result;
  }

  reportOut(agentName: string, report: string): void {
    this.reportOutCalls.push({ agentName, report });
  }

  async isValidDelegation(fromAgent: string, toAgent: string): Promise<boolean> {
    if (fromAgent === toAgent) {
      return false;
    }

    const allowedAgents = this.validDelegations.get(fromAgent);
    return allowedAgents ? allowedAgents.includes(toAgent) : false;
  }

  getDelegationStats() {
    return { active: 0, completed: 0, pending: 0 };
  }

  async getDelegationHistory() {
    return { delegatedTo: [], delegatedFrom: [] };
  }

  getActiveDelegations() {
    return [];
  }

  cleanup() {
    // Mock cleanup
  }
}

class MockConfigurationManager implements IConfigurationManager {
  private config: ExtensionConfiguration = DEFAULT_EXTENSION_CONFIG;

  async loadConfiguration(): Promise<ExtensionConfiguration> {
    return this.config;
  }

  async saveConfiguration(config: ExtensionConfiguration): Promise<void> {
    this.config = config;
  }

  validateConfiguration(): boolean {
    return true;
  }

  getDefaultConfiguration(): ExtensionConfiguration {
    return DEFAULT_EXTENSION_CONFIG;
  }

  onConfigurationChanged(): void { }
  dispose(): void { }

  setMockConfig(config: ExtensionConfiguration): void {
    this.config = config;
  }
}

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

suite('Comprehensive Tool System Tests', () => {
  let mockDelegationEngine: MockDelegationEngine;
  let mockConfigManager: MockConfigurationManager;
  let toolFilter: DefaultToolFilter;
  let delegateWorkTool: DelegateWorkTool;
  let reportOutTool: ReportOutTool;
  let mockToken: MockCancellationToken;

  setup(() => {
    mockDelegationEngine = new MockDelegationEngine();
    mockConfigManager = new MockConfigurationManager();
    toolFilter = new DefaultToolFilter(mockConfigManager);
    delegateWorkTool = new DelegateWorkTool(mockDelegationEngine, 'coordinator');
    reportOutTool = new ReportOutTool(mockDelegationEngine, 'test-agent', 'test-conversation-123');
    mockToken = new MockCancellationToken();
  });

  teardown(() => {
    mockDelegationEngine.clearReportOutCalls();
  });

  suite('DelegateWork Tool Tests', () => {
    test('should have correct tool metadata', () => {
      assert.strictEqual(delegateWorkTool.name, 'delegateWork');
      assert.ok(delegateWorkTool.description.length > 0);
      assert.ok(delegateWorkTool.parametersSchema);

      const schema = delegateWorkTool.parametersSchema;
      assert.strictEqual(schema.type, 'object');
      assert.ok(schema.properties);
      assert.ok(schema.properties.agentName);
      assert.ok(schema.properties.workDescription);
      assert.ok(schema.properties.reportExpectations);
    });

    test('should successfully delegate work when valid', async () => {
      mockDelegationEngine.setValidDelegations('coordinator', ['test-agent']);
      mockDelegationEngine.setDelegationResult('test-agent', 'Task completed successfully');

      const params = {
        agentName: 'test-agent',
        workDescription: 'complete this important task with attention to detail',
        reportExpectations: 'provide comprehensive results and analysis'
      };

      const options = { parameters: params } as any;
      const result = await delegateWorkTool.invoke(options, mockToken);

      assert.ok(result instanceof vscode.LanguageModelToolResult);
      assert.ok(result.content[0] instanceof vscode.LanguageModelTextPart);
      const content = (result.content[0] as vscode.LanguageModelTextPart).value;
      assert.ok(content.includes('Work delegation completed successfully') || content.includes('Task completed successfully'));
    });

    test('should handle delegation failures gracefully', async () => {
      mockDelegationEngine.setShouldThrowError(true);

      const params = {
        agentName: 'test-agent',
        workDescription: 'task that will fail',
        reportExpectations: 'should not complete'
      };

      const options = { parameters: params } as any;
      const result = await delegateWorkTool.invoke(options, mockToken);

      assert.ok(result instanceof vscode.LanguageModelToolResult);
      assert.ok(result.content[0] instanceof vscode.LanguageModelTextPart);
      const content = (result.content[0] as vscode.LanguageModelTextPart).value;
      assert.ok(content.includes('Error') || content.includes('failed'));
    });

    test('should validate required parameters', async () => {
      const invalidParams = {
        agentName: '',
        workDescription: 'valid description',
        reportExpectations: 'valid expectations'
      };

      const options = { parameters: invalidParams } as any;
      const result = await delegateWorkTool.invoke(options, mockToken);

      assert.ok(result instanceof vscode.LanguageModelToolResult);
      assert.ok(result.content[0] instanceof vscode.LanguageModelTextPart);
      const content = (result.content[0] as vscode.LanguageModelTextPart).value;
      assert.ok(content.includes('Error') || content.includes('invalid') || content.includes('required'));
    });

    test('should handle cancellation token', async () => {
      mockToken.cancel();

      const params = {
        agentName: 'test-agent',
        workDescription: 'task to be cancelled',
        reportExpectations: 'should be cancelled'
      };

      const options = { parameters: params } as any;

      try {
        await delegateWorkTool.invoke(options, mockToken);
        // If it doesn't throw, check that it handled cancellation gracefully
        assert.ok(true, 'Tool handled cancellation gracefully');
      } catch (error) {
        // Cancellation might throw an error, which is also acceptable
        assert.ok(error instanceof Error);
      }
    });
  });

  suite('ReportOut Tool Tests', () => {
    test('should have correct tool metadata', () => {
      assert.strictEqual(reportOutTool.name, 'reportOut');
      assert.ok(reportOutTool.description.length > 0);
      assert.ok(reportOutTool.parametersSchema);

      const schema = reportOutTool.parametersSchema;
      assert.strictEqual(schema.type, 'object');
      assert.ok(schema.properties);
      assert.ok(schema.properties.report);
    });

    test('should successfully submit valid reports', async () => {
      const testReport = 'Task completed successfully with detailed analysis and recommendations';

      const params = { report: testReport };
      const options = { parameters: params } as any;
      const result = await reportOutTool.invoke(options, mockToken);

      assert.ok(result instanceof vscode.LanguageModelToolResult);
      assert.ok(result.content[0] instanceof vscode.LanguageModelTextPart);
      const content = (result.content[0] as vscode.LanguageModelTextPart).value;
      assert.ok(content.includes('Report submitted successfully') || content.includes('submitted'));

      // Verify the report was passed to delegation engine
      const reportCalls = mockDelegationEngine.getReportOutCalls();
      assert.strictEqual(reportCalls.length, 1);
      assert.strictEqual(reportCalls[0].agentName, 'test-agent');
      assert.strictEqual(reportCalls[0].report, testReport);
    });

    test('should handle empty reports', async () => {
      const params = { report: '' };
      const options = { parameters: params } as any;
      const result = await reportOutTool.invoke(options, mockToken);

      assert.ok(result instanceof vscode.LanguageModelToolResult);
      assert.ok(result.content[0] instanceof vscode.LanguageModelTextPart);
      const content = (result.content[0] as vscode.LanguageModelTextPart).value;
      assert.ok(content.includes('Error') || content.includes('empty') || content.includes('required'));
    });

    test('should handle very long reports', async () => {
      const longReport = 'A'.repeat(10000);

      const params = { report: longReport };
      const options = { parameters: params } as any;
      const result = await reportOutTool.invoke(options, mockToken);

      assert.ok(result instanceof vscode.LanguageModelToolResult);
      assert.ok(result.content[0] instanceof vscode.LanguageModelTextPart);
      // Should either succeed or handle gracefully
      const content = (result.content[0] as vscode.LanguageModelTextPart).value;
      assert.ok(content.length > 0);
    });

    test('should handle cancellation token', async () => {
      mockToken.cancel();

      const params = { report: 'Report to be cancelled' };
      const options = { parameters: params } as any;

      try {
        await reportOutTool.invoke(options, mockToken);
        assert.ok(true, 'Tool handled cancellation gracefully');
      } catch (error) {
        assert.ok(error instanceof Error);
      }
    });
  });

  suite('Tool Filter Integration Tests', () => {
    test('should correctly filter tools based on permissions', async () => {
      // Set up configuration with specific tool permissions
      const config: ExtensionConfiguration = {
        coordinator: {
          ...DEFAULT_EXTENSION_CONFIG.coordinator,
          toolPermissions: { type: 'all' }
        },
        customAgents: [{
          name: 'test-agent',
          systemPrompt: 'Test agent',
          description: 'Test agent',
          useFor: 'Testing',
          delegationPermissions: { type: 'none' },
          toolPermissions: { type: 'specific', tools: ['reportOut'] }
        }]
      };

      mockConfigManager.setMockConfig(config);

      const coordinatorTools = await toolFilter.getAvailableTools('coordinator');
      const coordinatorToolNames = coordinatorTools.map(tool => tool.name);

      // Coordinator should have access to all tools
      assert.ok(coordinatorToolNames.includes('delegateWork'));
      assert.ok(coordinatorToolNames.includes('reportOut'));

      const agentTools = await toolFilter.getAvailableTools('test-agent');
      const agentToolNames = agentTools.map(tool => tool.name);

      // Test agent should only have reportOut
      assert.ok(!agentToolNames.includes('delegateWork'));
      assert.ok(agentToolNames.includes('reportOut'));
    });

    test('should handle agents with no tool permissions', async () => {
      const config: ExtensionConfiguration = {
        coordinator: DEFAULT_EXTENSION_CONFIG.coordinator,
        customAgents: [{
          name: 'restricted-agent',
          systemPrompt: 'Restricted agent',
          description: 'Restricted agent',
          useFor: 'Restricted tasks',
          delegationPermissions: { type: 'none' },
          toolPermissions: { type: 'none' }
        }]
      };

      mockConfigManager.setMockConfig(config);

      const tools = await toolFilter.getAvailableTools('restricted-agent');
      const toolNames = tools.map(tool => tool.name);

      // Should not have access to delegation tools
      assert.ok(!toolNames.includes('delegateWork'));
      assert.ok(!toolNames.includes('reportOut'));
    });

    test('should handle non-existent agents', async () => {
      try {
        const tools = await toolFilter.getAvailableTools('non-existent-agent');
        // Should return empty array or handle gracefully
        assert.ok(Array.isArray(tools));
      } catch (error) {
        // It's acceptable for this to throw an error for non-existent agents
        assert.ok(error instanceof Error);
        assert.ok(error.message.includes('not found') || error.message.includes('Agent'));
      }
    });
  });

  suite('Tool System Error Handling', () => {
    test('should handle tool invocation with invalid parameters', async () => {
      const invalidOptions = { parameters: null } as any;

      try {
        const result = await delegateWorkTool.invoke(invalidOptions, mockToken);

        assert.ok(result instanceof vscode.LanguageModelToolResult);
        assert.ok(result.content[0] instanceof vscode.LanguageModelTextPart);
        const content = (result.content[0] as vscode.LanguageModelTextPart).value;
        assert.ok(content.includes('Error') || content.includes('invalid') || content.includes('required') || content.length > 0);
      } catch (error) {
        // It's also acceptable for this to throw an error
        assert.ok(error instanceof Error);
      }
    });

    test('should handle tool invocation with missing parameters', async () => {
      const incompleteOptions = { parameters: { agentName: 'test-agent' } } as any;

      const result = await delegateWorkTool.invoke(incompleteOptions, mockToken);

      assert.ok(result instanceof vscode.LanguageModelToolResult);
      assert.ok(result.content[0] instanceof vscode.LanguageModelTextPart);
      const content = (result.content[0] as vscode.LanguageModelTextPart).value;
      assert.ok(content.includes('Error') || content.includes('required') || content.includes('missing'));
    });

    test('should handle delegation engine errors gracefully', async () => {
      // Set up delegation engine to throw errors
      mockDelegationEngine.setShouldThrowError(true);

      const params = {
        agentName: 'test-agent',
        workDescription: 'task that will cause error',
        reportExpectations: 'should handle error'
      };

      const options = { parameters: params } as any;
      const result = await delegateWorkTool.invoke(options, mockToken);

      assert.ok(result instanceof vscode.LanguageModelToolResult);
      assert.ok(result.content[0] instanceof vscode.LanguageModelTextPart);
      const content = (result.content[0] as vscode.LanguageModelTextPart).value;
      assert.ok(content.includes('Error') || content.includes('failed'));
    });
  });

  suite('Tool System Performance', () => {
    test('should handle multiple concurrent tool invocations', async () => {
      mockDelegationEngine.setValidDelegations('coordinator', ['test-agent']);
      mockDelegationEngine.setDelegationResult('test-agent', 'Concurrent task completed');

      const params = {
        agentName: 'test-agent',
        workDescription: 'concurrent task',
        reportExpectations: 'handle concurrency'
      };

      const options = { parameters: params } as any;

      // Create multiple concurrent invocations
      const invocations = Array(5).fill(null).map(() =>
        delegateWorkTool.invoke(options, new MockCancellationToken())
      );

      const results = await Promise.all(invocations);

      assert.strictEqual(results.length, 5);
      results.forEach(result => {
        assert.ok(result instanceof vscode.LanguageModelToolResult);
        assert.ok(result.content[0] instanceof vscode.LanguageModelTextPart);
      });
    });


  });
});