import * as assert from 'assert';
import * as vscode from 'vscode';
import { ReportOutTool, ReportOutParameters } from '../tools/report-out-tool';
import { DelegationEngine } from '../models/delegation-engine';

// Mock implementation of DelegationEngine for testing
class MockDelegationEngine implements DelegationEngine {
  private reportedOut: Map<string, string> = new Map();

  async delegateWork(
    fromAgent: string,
    toAgent: string,
    workDescription: string,
    reportExpectations: string
  ): Promise<string> {
    // Mock implementation - not used in reportOut tests
    return 'mock result';
  }

  reportOut(agentName: string, report: string): void {
    this.reportedOut.set(agentName, report);
  }

  isValidDelegation(fromAgent: string, toAgent: string): boolean {
    // Mock implementation - not used in reportOut tests
    return true;
  }

  getReportedOut(agentName: string): string | undefined {
    return this.reportedOut.get(agentName);
  }

  hasReportedOut(agentName: string): boolean {
    return this.reportedOut.has(agentName);
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

suite('ReportOutTool Tests', () => {
  let mockDelegationEngine: MockDelegationEngine;
  let reportOutTool: ReportOutTool;
  let mockToken: MockCancellationToken;

  setup(() => {
    mockDelegationEngine = new MockDelegationEngine();
    reportOutTool = new ReportOutTool(mockDelegationEngine, 'test-agent', 'conversation-123');
    mockToken = new MockCancellationToken();
  });

  test('should have correct tool metadata', () => {
    assert.strictEqual(reportOutTool.name, 'reportOut');
    assert.ok(reportOutTool.description.length > 0);
    assert.ok(reportOutTool.parametersSchema);
    assert.strictEqual(reportOutTool.parametersSchema.type, 'object');
    assert.ok(reportOutTool.parametersSchema.properties);
    assert.ok(reportOutTool.parametersSchema.required);
  });

  test('should validate required parameters', async () => {
    const invalidParameters = [
      {}, // missing report
      { report: '' }, // empty report
      { report: null }, // null report
      { report: undefined }, // undefined report
    ];

    for (const params of invalidParameters) {
      const options = { parameters: params as ReportOutParameters } as any;
      const result = await reportOutTool.invoke(options, mockToken);
      assert.ok(result instanceof vscode.LanguageModelToolResult);
      assert.ok(result.content[0] instanceof vscode.LanguageModelTextPart);
      const content = (result.content[0] as vscode.LanguageModelTextPart).value;
      assert.ok(content.includes('Failed to submit report:'));
    }
  });

  test('should validate report length constraints', async () => {
    const invalidParameters = [
      { report: 'short' }, // too short (less than 10 chars)
      { report: '   short   ' }, // too short after trimming
      { report: 'a'.repeat(5001) }, // too long (more than 5000 chars)
    ];

    for (const params of invalidParameters) {
      const options = { parameters: params } as any;
      const result = await reportOutTool.invoke(options, mockToken);
      assert.ok(result instanceof vscode.LanguageModelToolResult);
      assert.ok(result.content[0] instanceof vscode.LanguageModelTextPart);
      const content = (result.content[0] as vscode.LanguageModelTextPart).value;
      assert.ok(content.includes('Failed to submit report:'));
    }
  });

  test('should successfully submit valid report', async () => {
    const params: ReportOutParameters = {
      report: 'This is a detailed report of the completed work with all necessary information and findings.'
    };

    const options = { parameters: params } as any;
    const result = await reportOutTool.invoke(options, mockToken);

    // Check that the result indicates success
    assert.ok(result instanceof vscode.LanguageModelToolResult);
    assert.ok(result.content[0] instanceof vscode.LanguageModelTextPart);
    const content = (result.content[0] as vscode.LanguageModelTextPart).value;
    assert.ok(content.includes('Report submitted successfully'));
    assert.ok(content.includes('Agent execution will now terminate'));

    // Check that the delegation engine received the report
    assert.ok(mockDelegationEngine.hasReportedOut('test-agent'));
    assert.strictEqual(mockDelegationEngine.getReportedOut('test-agent'), params.report);
  });

  test('should handle long reports with truncation in response', async () => {
    const longReport = 'This is a very long report. '.repeat(50); // Creates a report longer than 200 chars
    const params: ReportOutParameters = {
      report: longReport
    };

    const options = { parameters: params } as any;
    const result = await reportOutTool.invoke(options, mockToken);

    // Check that the result shows truncated version
    assert.ok(result instanceof vscode.LanguageModelToolResult);
    assert.ok(result.content[0] instanceof vscode.LanguageModelTextPart);
    const content = (result.content[0] as vscode.LanguageModelTextPart).value;
    assert.ok(content.includes('Report submitted successfully'));
    assert.ok(content.includes('...'), 'Should show truncation ellipsis');

    // Check that the full report was still submitted to delegation engine
    assert.strictEqual(mockDelegationEngine.getReportedOut('test-agent'), longReport);
  });

  test('should handle cancellation during report submission', async () => {
    const params: ReportOutParameters = {
      report: 'This is a valid report that should be submitted.'
    };

    // Cancel the token before invoking
    mockToken.cancel();

    try {
      const options = { parameters: params } as any;
      await reportOutTool.invoke(options, mockToken);
      assert.fail('Expected CancellationError to be thrown');
    } catch (error) {
      assert.ok(error instanceof vscode.CancellationError);
    }
  });

  test('should handle minimum valid report length', async () => {
    const params: ReportOutParameters = {
      report: '1234567890' // exactly 10 characters
    };

    const options = { parameters: params } as any;
    const result = await reportOutTool.invoke(options, mockToken);

    assert.ok(result instanceof vscode.LanguageModelToolResult);
    assert.ok(result.content[0] instanceof vscode.LanguageModelTextPart);
    const content = (result.content[0] as vscode.LanguageModelTextPart).value;
    assert.ok(content.includes('Report submitted successfully'));

    assert.ok(mockDelegationEngine.hasReportedOut('test-agent'));
    assert.strictEqual(mockDelegationEngine.getReportedOut('test-agent'), params.report);
  });

  test('should handle maximum valid report length', async () => {
    const params: ReportOutParameters = {
      report: 'a'.repeat(5000) // exactly 5000 characters
    };

    const options = { parameters: params } as any;
    const result = await reportOutTool.invoke(options, mockToken);

    assert.ok(result instanceof vscode.LanguageModelToolResult);
    assert.ok(result.content[0] instanceof vscode.LanguageModelTextPart);
    const content = (result.content[0] as vscode.LanguageModelTextPart).value;
    assert.ok(content.includes('Report submitted successfully'));

    assert.ok(mockDelegationEngine.hasReportedOut('test-agent'));
    assert.strictEqual(mockDelegationEngine.getReportedOut('test-agent'), params.report);
  });

  test('should validate parameter schema structure', () => {
    const schema = reportOutTool.parametersSchema;

    // Check required properties exist
    assert.ok(schema.properties.report);

    // Check required array
    assert.deepStrictEqual(schema.required, ['report']);

    // Check report constraints
    assert.strictEqual(schema.properties.report.type, 'string');
    assert.strictEqual(schema.properties.report.minLength, 10);
    assert.strictEqual(schema.properties.report.maxLength, 5000);
    assert.ok(schema.properties.report.description);
  });

  test('should handle whitespace-only reports correctly', async () => {
    const params: ReportOutParameters = {
      report: '          ' // 10 spaces, but should fail trimming validation
    };

    const options = { parameters: params } as any;
    const result = await reportOutTool.invoke(options, mockToken);
    assert.ok(result instanceof vscode.LanguageModelToolResult);
    assert.ok(result.content[0] instanceof vscode.LanguageModelTextPart);
    const content = (result.content[0] as vscode.LanguageModelTextPart).value;
    assert.ok(content.includes('Failed to submit report:'));
    assert.ok(content.includes('at least 10 characters'));
  });

  test('should handle reports with mixed content correctly', async () => {
    const params: ReportOutParameters = {
      report: '   Valid report content with leading/trailing spaces   '
    };

    const options = { parameters: params } as any;
    const result = await reportOutTool.invoke(options, mockToken);

    assert.ok(result instanceof vscode.LanguageModelToolResult);
    assert.ok(result.content[0] instanceof vscode.LanguageModelTextPart);
    const content = (result.content[0] as vscode.LanguageModelTextPart).value;
    assert.ok(content.includes('Report submitted successfully'));

    // Should submit the full report including spaces
    assert.strictEqual(mockDelegationEngine.getReportedOut('test-agent'), params.report);
  });
});