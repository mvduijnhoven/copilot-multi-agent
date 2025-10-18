/**
 * Tests for tool discovery and initialization
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import { DefaultToolFilter } from '../services/tool-filter';
import { ConfigurationManager } from '../services/configuration-manager';

suite('Tool Discovery Tests', () => {
  let toolFilter: DefaultToolFilter;
  let configManager: ConfigurationManager;

  setup(() => {
    configManager = new ConfigurationManager();
    toolFilter = new DefaultToolFilter(configManager);
  });

  teardown(() => {
    configManager.dispose();
  });

  test('Tool filter initializes with custom delegation tools', async () => {
    const allToolNames = toolFilter.getAllToolNames();
    
    // Should have at least the 2 custom delegation tools
    assert.ok(allToolNames.length >= 2, 'Should have at least 2 custom tools');
    assert.ok(allToolNames.includes('delegateWork'), 'Should include delegateWork tool');
    assert.ok(allToolNames.includes('reportOut'), 'Should include reportOut tool');
  });

  test('Tool filter can be updated with additional tools', async () => {
    const initialCount = toolFilter.getAllToolNames().length;
    
    // Add mock GitHub Copilot tools
    const mockTools = [
      { name: 'codeSearch', description: 'Search code' },
      { name: 'fileEdit', description: 'Edit files' },
      { name: 'terminalCommand', description: 'Run terminal commands' }
    ];
    
    toolFilter.setAvailableTools(mockTools);
    
    const updatedCount = toolFilter.getAllToolNames().length;
    assert.ok(updatedCount > initialCount, 'Tool count should increase after adding tools');
    assert.ok(updatedCount >= 5, 'Should have custom tools + mock tools'); // 2 custom + 3 mock
  });

  test('Tool filtering works with specific permissions', async () => {
    // Add mock tools
    const mockTools = [
      { name: 'codeSearch', description: 'Search code' },
      { name: 'fileEdit', description: 'Edit files' },
      { name: 'terminalCommand', description: 'Run terminal commands' }
    ];
    
    toolFilter.setAvailableTools(mockTools);
    
    // Test specific tool permissions
    const specificPermissions = {
      type: 'specific' as const,
      tools: ['codeSearch', 'delegateWork']
    };
    
    const allTools = toolFilter.getAllToolNames().map(name => ({ name }));
    const filteredTools = toolFilter.filterTools(allTools, specificPermissions);
    
    assert.strictEqual(filteredTools.length, 2, 'Should filter to only specified tools');
    
    const filteredNames = filteredTools.map(tool => tool.name);
    assert.ok(filteredNames.includes('codeSearch'), 'Should include codeSearch');
    assert.ok(filteredNames.includes('delegateWork'), 'Should include delegateWork');
  });

  test('Tool filtering works with all permissions', async () => {
    // Add mock tools
    const mockTools = [
      { name: 'codeSearch', description: 'Search code' },
      { name: 'fileEdit', description: 'Edit files' }
    ];
    
    toolFilter.setAvailableTools(mockTools);
    
    const allPermissions = { type: 'all' as const };
    const allTools = toolFilter.getAllToolNames().map(name => ({ name }));
    const filteredTools = toolFilter.filterTools(allTools, allPermissions);
    
    assert.strictEqual(filteredTools.length, allTools.length, 'Should include all tools with all permissions');
  });

  test('Tool filtering works with none permissions', async () => {
    const nonePermissions = { type: 'none' as const };
    const allTools = toolFilter.getAllToolNames().map(name => ({ name }));
    const filteredTools = toolFilter.filterTools(allTools, nonePermissions);
    
    assert.strictEqual(filteredTools.length, 0, 'Should include no tools with none permissions');
  });

  test('getAvailableTools returns filtered tools for coordinator', async () => {
    // This test requires a valid configuration, so we'll mock it
    const mockConfig = {
      entryAgent: 'coordinator',
      agents: [
        {
          name: 'coordinator' as const,
          systemPrompt: 'Test prompt',
          description: 'Test coordinator',
          useFor: 'Testing',
          delegationPermissions: { type: 'all' as const },
          toolPermissions: { type: 'all' as const }
        }
      ]
    };

    // Mock the configuration manager
    const originalLoadConfig = configManager.loadConfiguration;
    configManager.loadConfiguration = async () => mockConfig;

    try {
      const coordinatorTools = await toolFilter.getAvailableTools('coordinator');
      assert.ok(Array.isArray(coordinatorTools), 'Should return an array of tools');
      assert.ok(coordinatorTools.length >= 2, 'Should have at least the custom delegation tools');
    } finally {
      // Restore original method
      configManager.loadConfiguration = originalLoadConfig;
    }
  });
});