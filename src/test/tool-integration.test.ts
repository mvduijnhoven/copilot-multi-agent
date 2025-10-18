/**
 * Integration tests for tool discovery and chat participant
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import { ConfigurationManager } from '../services/configuration-manager';
import { DefaultToolFilter } from '../services/tool-filter';
import { DefaultAgentEngine } from '../services/agent-engine';
import { SystemPromptBuilder } from '../services/system-prompt-builder';

suite('Tool Integration Tests', () => {
  let configManager: ConfigurationManager;
  let toolFilter: DefaultToolFilter;
  let agentEngine: DefaultAgentEngine;

  setup(() => {
    configManager = new ConfigurationManager();
    toolFilter = new DefaultToolFilter(configManager);
    const systemPromptBuilder = new SystemPromptBuilder();
    agentEngine = new DefaultAgentEngine(toolFilter, systemPromptBuilder);
  });

  teardown(() => {
    configManager.dispose();
  });

  test('Complete tool integration flow', async () => {
    // Step 1: Initialize with mock GitHub Copilot tools
    const mockCopilotTools = [
      { name: 'codeSearch', description: 'Search through code' },
      { name: 'fileEdit', description: 'Edit files' },
      { name: 'terminalCommand', description: 'Execute terminal commands' },
      { name: 'gitOperation', description: 'Perform git operations' },
      { name: 'debugger', description: 'Debug code' },
      { name: 'testRunner', description: 'Run tests' },
      { name: 'linter', description: 'Lint code' },
      { name: 'formatter', description: 'Format code' },
      { name: 'refactor', description: 'Refactor code' },
      { name: 'documentation', description: 'Generate documentation' },
      { name: 'codeGeneration', description: 'Generate code' }
    ];

    toolFilter.setAvailableTools(mockCopilotTools);

    // Step 2: Verify total tool count (11 mock + 2 custom = 13)
    const allToolNames = toolFilter.getAllToolNames();
    assert.strictEqual(allToolNames.length, 13, 'Should have 13 total tools (11 mock + 2 custom)');

    // Step 3: Mock configuration for coordinator with specific tool permissions
    const mockConfig = {
      entryAgent: 'coordinator',
      agents: [
        {
          name: 'coordinator' as const,
          systemPrompt: 'You are a multi-agent coordinator',
          description: 'Coordinates work between agents',
          useFor: 'Task orchestration and delegation',
          delegationPermissions: { type: 'all' as const },
          toolPermissions: { 
            type: 'specific' as const, 
            tools: ['codeSearch', 'fileEdit', 'delegateWork', 'reportOut', 'gitOperation']
          }
        }
      ]
    };

    // Mock the configuration manager
    const originalLoadConfig = configManager.loadConfiguration;
    configManager.loadConfiguration = async () => mockConfig;

    try {
      // Step 4: Get available tools for coordinator
      const coordinatorTools = await toolFilter.getAvailableTools('coordinator');
      
      // Should have exactly 5 tools based on specific permissions
      assert.strictEqual(coordinatorTools.length, 5, 'Coordinator should have 5 tools based on specific permissions');

      const coordinatorToolNames = coordinatorTools.map(tool => tool.name || 'unknown');
      assert.ok(coordinatorToolNames.includes('codeSearch'), 'Should include codeSearch');
      assert.ok(coordinatorToolNames.includes('fileEdit'), 'Should include fileEdit');
      assert.ok(coordinatorToolNames.includes('delegateWork'), 'Should include delegateWork');
      assert.ok(coordinatorToolNames.includes('reportOut'), 'Should include reportOut');
      assert.ok(coordinatorToolNames.includes('gitOperation'), 'Should include gitOperation');

      // Step 5: Initialize coordinator agent
      const coordinatorContext = await agentEngine.initializeAgent(mockConfig.agents[0]);
      
      // Verify agent context has the filtered tools
      assert.strictEqual(coordinatorContext.availableTools.length, 5, 'Agent context should have 5 filtered tools');
      assert.strictEqual(coordinatorContext.agentName, 'coordinator', 'Agent name should be coordinator');
      assert.ok(coordinatorContext.conversationId, 'Should have a conversation ID');

      console.log('✅ Tool integration test completed successfully');
      console.log(`   - Total available tools: ${allToolNames.length}`);
      console.log(`   - Coordinator filtered tools: ${coordinatorContext.availableTools.length}`);
      console.log(`   - Tool names: ${coordinatorToolNames.join(', ')}`);

    } finally {
      // Restore original method
      configManager.loadConfiguration = originalLoadConfig;
    }
  });

  test('Tool permissions validation', async () => {
    // Test different permission types
    const testCases = [
      {
        permissions: { type: 'all' as const },
        expectedCount: 4, // All tools (2 mock + 2 custom)
        description: 'all permissions'
      },
      {
        permissions: { type: 'none' as const },
        expectedCount: 0, // No tools
        description: 'none permissions'
      },
      {
        permissions: { 
          type: 'specific' as const, 
          tools: ['delegateWork', 'reportOut'] 
        },
        expectedCount: 2, // Only delegation tools
        description: 'specific permissions (delegation only)'
      }
    ];

    // Add mock tools
    const mockTools = [
      { name: 'tool1', description: 'Test tool 1' },
      { name: 'tool2', description: 'Test tool 2' }
    ];
    toolFilter.setAvailableTools(mockTools);

    for (const testCase of testCases) {
      const allTools = toolFilter.getAllToolNames().map(name => ({ name }));
      const filteredTools = toolFilter.filterTools(allTools, testCase.permissions);
      
      assert.strictEqual(
        filteredTools.length, 
        testCase.expectedCount, 
        `Should have ${testCase.expectedCount} tools with ${testCase.description}`
      );
    }
  });

  test('Tool access validation', async () => {
    // Add mock tools
    const mockTools = [
      { name: 'allowedTool', description: 'This tool is allowed' },
      { name: 'deniedTool', description: 'This tool is denied' }
    ];
    toolFilter.setAvailableTools(mockTools);

    // Mock configuration with specific tool permissions
    const mockConfig = {
      entryAgent: 'coordinator',
      agents: [
        {
          name: 'coordinator' as const,
          systemPrompt: 'Test prompt',
          description: 'Test coordinator',
          useFor: 'Testing',
          delegationPermissions: { type: 'all' as const },
          toolPermissions: { 
            type: 'specific' as const, 
            tools: ['allowedTool', 'delegateWork'] 
          }
        }
      ]
    };

    const originalLoadConfig = configManager.loadConfiguration;
    configManager.loadConfiguration = async () => mockConfig;

    try {
      // Test tool access
      const hasAllowedTool = await toolFilter.hasToolAccess('coordinator', 'allowedTool');
      const hasDeniedTool = await toolFilter.hasToolAccess('coordinator', 'deniedTool');
      const hasDelegateWork = await toolFilter.hasToolAccess('coordinator', 'delegateWork');

      assert.strictEqual(hasAllowedTool, true, 'Should have access to allowed tool');
      assert.strictEqual(hasDeniedTool, false, 'Should not have access to denied tool');
      assert.strictEqual(hasDelegateWork, true, 'Should have access to delegation tool');

    } finally {
      configManager.loadConfiguration = originalLoadConfig;
    }
  });
});