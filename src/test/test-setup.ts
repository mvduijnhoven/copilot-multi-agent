/**
 * Test setup and utilities for comprehensive test suite
 * Provides mocks and utilities that don't depend on VS Code extension activation
 */

import * as sinon from 'sinon';

// Mock VS Code API for testing
export const mockVscode = {
  workspace: {
    getConfiguration: sinon.stub(),
    onDidChangeConfiguration: sinon.stub().returns({ dispose: sinon.stub() })
  },
  window: {
    createOutputChannel: sinon.stub().returns({
      appendLine: sinon.stub(),
      show: sinon.stub(),
      dispose: sinon.stub()
    }),
    showErrorMessage: sinon.stub().resolves(),
    showWarningMessage: sinon.stub().resolves(),
    showInformationMessage: sinon.stub().resolves()
  },
  ConfigurationTarget: {
    Global: 1,
    Workspace: 2,
    WorkspaceFolder: 3
  },
  ExtensionContext: class MockExtensionContext {
    subscriptions: any[] = [];
    workspaceState = {
      get: sinon.stub(),
      update: sinon.stub()
    };
    globalState = {
      get: sinon.stub(),
      update: sinon.stub()
    };
  },
  Disposable: class MockDisposable {
    dispose = sinon.stub();
  }
};

// Replace global vscode for testing
(global as any).vscode = mockVscode;

/**
 * Setup function to initialize test environment
 */
export function setupTestEnvironment() {
  // Reset all stubs
  sinon.restore();
  
  // Setup default mock behaviors
  mockVscode.workspace.getConfiguration.returns({
    get: sinon.stub(),
    update: sinon.stub().resolves(),
    has: sinon.stub().returns(true),
    inspect: sinon.stub()
  });
  
  mockVscode.workspace.onDidChangeConfiguration.returns({
    dispose: sinon.stub()
  });
  
  mockVscode.window.createOutputChannel.returns({
    appendLine: sinon.stub(),
    show: sinon.stub(),
    dispose: sinon.stub()
  });
}

/**
 * Cleanup function to reset test environment
 */
export function cleanupTestEnvironment() {
  sinon.restore();
}

/**
 * Create a mock VS Code configuration object
 */
export function createMockConfiguration(config: any = {}) {
  return {
    get: sinon.stub().callsFake((key: string, defaultValue?: any) => {
      return config[key] !== undefined ? config[key] : defaultValue;
    }),
    update: sinon.stub().resolves(),
    has: sinon.stub().callsFake((key: string) => config[key] !== undefined),
    inspect: sinon.stub().returns({
      key: '',
      defaultValue: undefined,
      globalValue: undefined,
      workspaceValue: undefined,
      workspaceFolderValue: undefined
    })
  };
}

/**
 * Test utilities for performance monitoring
 */
export class TestPerformanceMonitor {
  private startTime: number = 0;
  private memoryStart: number = 0;

  start(): void {
    this.startTime = Date.now();
    if (process.memoryUsage) {
      this.memoryStart = process.memoryUsage().heapUsed;
    }
  }

  end(): { duration: number; memoryDelta: number } {
    const duration = Date.now() - this.startTime;
    let memoryDelta = 0;
    
    if (process.memoryUsage) {
      memoryDelta = process.memoryUsage().heapUsed - this.memoryStart;
    }

    return { duration, memoryDelta };
  }
}

/**
 * Utility to create test agents with default values
 */
export function createTestAgent(
  name: string, 
  useFor: string = `${name} specific tasks`,
  delegationPermissions: any = { type: 'none' },
  toolPermissions: any = { type: 'all' },
  overrides: any = {}
) {
  return {
    name,
    systemPrompt: `You are ${name} agent with comprehensive capabilities for ${useFor}`,
    description: `${name} agent description`,
    useFor,
    delegationPermissions,
    toolPermissions,
    ...overrides
  };
}

/**
 * Utility to create test configuration
 */
export function createTestConfiguration(agents: any[]) {
  return {
    entryAgent: agents[0]?.name || 'coordinator',
    agents
  };
}

/**
 * Async utility to wait for a specified time
 */
export function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Utility to run a function with timeout
 */
export async function withTimeout<T>(
  promise: Promise<T>, 
  timeoutMs: number, 
  errorMessage: string = 'Operation timed out'
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
  });
  
  return Promise.race([promise, timeoutPromise]);
}