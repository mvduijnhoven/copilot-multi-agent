/**
 * Unit tests for ToolFilter service
 */

import * as assert from 'assert';
import { DefaultToolFilter } from '../services/tool-filter';
import { IConfigurationManager } from '../services/configuration-manager';
import { 
  ToolPermissions, 
  ToolAccessError,
  DEFAULT_EXTENSION_CONFIG,
  DEFAULT_COORDINATOR_AGENT,
  AgentConfiguration,
  ExtensionConfiguration
} from '../models';

// Mock ConfigurationManager for testing
class MockConfigurationManager implements IConfigurationManager {
  private config: ExtensionConfiguration = {
    entryAgent: 'coordinator',
    agents: [
      DEFAULT_COORDINATOR_AGENT,
      {
        name: 'test-agent',
        systemPrompt: 'Test agent',
        description: 'Test agent',
        useFor: 'Testing',
        delegationPermissions: { type: 'none' as const },
        toolPermissions: { type: 'specific' as const, tools: ['tool1', 'tool2'] }
      },
      {
        name: 'all-tools-agent',
        systemPrompt: 'Agent with all tools',
        description: 'Agent with all tools',
        useFor: 'Testing',
        delegationPermissions: { type: 'none' as const },
        toolPermissions: { type: 'all' as const }
      },
      {
        name: 'no-tools-agent',
        systemPrompt: 'Agent with no tools',
        description: 'Agent with no tools',
        useFor: 'Testing',
        delegationPermissions: { type: 'none' as const },
        toolPermissions: { type: 'none' as const }
      }
    ]
  };

  async loadConfiguration() {
    return this.config;
  }

  async saveConfiguration(config: any) {
    this.config = { ...this.config, ...config };
  }

  validateConfiguration(config: any) {
    return true;
  }

  getDefaultConfiguration() {
    return DEFAULT_EXTENSION_CONFIG;
  }

  async getEntryAgent() {
    const entryAgentName = this.config.entryAgent;
    return this.config.agents.find(agent => agent.name === entryAgentName) || this.config.agents[0] || null;
  }

  onConfigurationChanged(callback: (config: any) => void) {
    // Mock implementation
  }

  dispose() {
    // Mock implementation
  }
}

suite('ToolFilter Tests', () => {
  let toolFilter: DefaultToolFilter;
  let configManager: MockConfigurationManager;

  const mockTools = [
    { name: 'tool1', description: 'First tool' },
    { name: 'tool2', description: 'Second tool' },
    { name: 'tool3', description: 'Third tool' },
    { name: 'tool4', description: 'Fourth tool' }
  ];

  setup(() => {
    configManager = new MockConfigurationManager();
    toolFilter = new DefaultToolFilter(configManager);
    toolFilter.setAvailableTools(mockTools);
  });

  suite('Tool Filtering', () => {
    test('should return all tools for "all" permission', () => {
      const permissions: ToolPermissions = { type: 'all' };
      const filtered = toolFilter.filterTools(mockTools, permissions);

      assert.strictEqual(filtered.length, mockTools.length);
      assert.deepStrictEqual(filtered, mockTools);
    });

    test('should return no tools for "none" permission', () => {
      const permissions: ToolPermissions = { type: 'none' };
      const filtered = toolFilter.filterTools(mockTools, permissions);

      assert.strictEqual(filtered.length, 0);
    });

    test('should return specific tools for "specific" permission', () => {
      const permissions: ToolPermissions = { 
        type: 'specific', 
        tools: ['tool1', 'tool3'] 
      };
      const filtered = toolFilter.filterTools(mockTools, permissions);

      assert.strictEqual(filtered.length, 2);
      assert.ok(filtered.some(tool => tool.name === 'tool1'));
      assert.ok(filtered.some(tool => tool.name === 'tool3'));
      assert.ok(!filtered.some(tool => tool.name === 'tool2'));
    });

    test('should handle empty specific tools array', () => {
      const permissions: ToolPermissions = { 
        type: 'specific', 
        tools: [] 
      };
      const filtered = toolFilter.filterTools(mockTools, permissions);

      assert.strictEqual(filtered.length, 0);
    });

    test('should handle non-existent tools in specific permission', () => {
      const permissions: ToolPermissions = { 
        type: 'specific', 
        tools: ['tool1', 'non-existent-tool'] 
      };
      const filtered = toolFilter.filterTools(mockTools, permissions);

      assert.strictEqual(filtered.length, 1);
      assert.strictEqual(filtered[0].name, 'tool1');
    });

    test('should handle invalid permission type', () => {
      const permissions = { type: 'invalid' } as any;
      const filtered = toolFilter.filterTools(mockTools, permissions);

      assert.strictEqual(filtered.length, 0);
    });
  });

  suite('Agent Tool Access', () => {
    test('should get available tools for coordinator', async () => {
      const tools = await toolFilter.getAvailableTools('coordinator');
      
      // Coordinator has specific tools: delegateWork, reportOut
      assert.ok(Array.isArray(tools));
      assert.ok(tools.some(tool => tool.name === 'delegateWork'));
      assert.ok(tools.some(tool => tool.name === 'reportOut'));
    });

    test('should get available tools for custom agent with specific permissions', async () => {
      const tools = await toolFilter.getAvailableTools('test-agent');
      
      assert.strictEqual(tools.length, 2);
      assert.ok(tools.some(tool => tool.name === 'tool1'));
      assert.ok(tools.some(tool => tool.name === 'tool2'));
    });

    test('should get all tools for agent with "all" permissions', async () => {
      const tools = await toolFilter.getAvailableTools('all-tools-agent');
      
      // Should include both mock tools and custom tools
      assert.ok(tools.length >= mockTools.length);
      assert.ok(tools.some(tool => tool.name === 'tool1'));
      assert.ok(tools.some(tool => tool.name === 'delegateWork'));
    });

    test('should get no tools for agent with "none" permissions', async () => {
      const tools = await toolFilter.getAvailableTools('no-tools-agent');
      
      assert.strictEqual(tools.length, 0);
    });

    test('should throw error for non-existent agent', async () => {
      try {
        await toolFilter.getAvailableTools('non-existent-agent');
        assert.fail('Should have thrown an error');
      } catch (error) {
        assert.ok(error instanceof ToolAccessError);
      }
    });
  });

  suite('Tool Access Checking', () => {
    test('should check if agent has access to specific tool', async () => {
      assert.strictEqual(await toolFilter.hasToolAccess('test-agent', 'tool1'), true);
      assert.strictEqual(await toolFilter.hasToolAccess('test-agent', 'tool2'), true);
      assert.strictEqual(await toolFilter.hasToolAccess('test-agent', 'tool3'), false);
    });

    test('should return false for non-existent agent', async () => {
      assert.strictEqual(await toolFilter.hasToolAccess('non-existent', 'tool1'), false);
    });

    test('should check coordinator tool access', async () => {
      assert.strictEqual(await toolFilter.hasToolAccess('coordinator', 'delegateWork'), true);
      assert.strictEqual(await toolFilter.hasToolAccess('coordinator', 'reportOut'), true);
      assert.strictEqual(await toolFilter.hasToolAccess('coordinator', 'tool1'), false);
    });
  });

  suite('Custom Tools Management', () => {
    test('should add custom tool', () => {
      const customTool = { name: 'customTool', description: 'Custom test tool' };
      toolFilter.addCustomTool('customTool', customTool);

      const allToolNames = toolFilter.getAllToolNames();
      assert.ok(allToolNames.includes('customTool'));
    });

    test('should remove custom tool', () => {
      const customTool = { name: 'customTool', description: 'Custom test tool' };
      toolFilter.addCustomTool('customTool', customTool);
      toolFilter.removeCustomTool('customTool');

      const allToolNames = toolFilter.getAllToolNames();
      assert.ok(!allToolNames.includes('customTool'));
    });

    test('should include custom tools in filtering', () => {
      const customTool = { name: 'customTool', description: 'Custom test tool' };
      toolFilter.addCustomTool('customTool', customTool);

      const permissions: ToolPermissions = { 
        type: 'specific', 
        tools: ['customTool'] 
      };
      const allTools = [...mockTools, customTool];
      const filtered = toolFilter.filterTools(allTools, permissions);

      assert.strictEqual(filtered.length, 1);
      assert.strictEqual(filtered[0].name, 'customTool');
    });
  });

  suite('Tool Name Extraction', () => {
    test('should extract name from tool object', () => {
      const tools = [
        { name: 'tool1' },
        { id: 'tool2' },
        { toolName: 'tool3' },
        'tool4',
        { description: 'no name' }
      ];

      const permissions: ToolPermissions = { 
        type: 'specific', 
        tools: ['tool1', 'tool2', 'tool3', 'tool4', 'unknown'] 
      };
      const filtered = toolFilter.filterTools(tools, permissions);

      assert.strictEqual(filtered.length, 5); // All tools should match
    });
  });

  suite('Permission Validation', () => {
    test('should validate valid tool permissions', () => {
      const validPermissions = [
        { type: 'all' },
        { type: 'none' },
        { type: 'specific', tools: ['tool1', 'tool2'] }
      ];

      validPermissions.forEach(permissions => {
        const result = toolFilter.validateToolPermissions(permissions as ToolPermissions);
        assert.strictEqual(result.isValid, true);
        assert.strictEqual(result.errors.length, 0);
      });
    });

    test('should validate invalid tool permissions', () => {
      const invalidPermissions = [
        null,
        undefined,
        'invalid',
        { type: 'invalid' },
        { type: 'specific' }, // missing tools array
        { type: 'specific', tools: 'not-array' },
        { type: 'specific', tools: ['', 'tool1'] } // empty tool name
      ];

      invalidPermissions.forEach(permissions => {
        const result = toolFilter.validateToolPermissions(permissions as any);
        assert.strictEqual(result.isValid, false);
        assert.ok(result.errors.length > 0);
      });
    });
  });

  suite('Agent Tool Permissions', () => {
    test('should get tool permissions for coordinator', async () => {
      const permissions = await toolFilter.getAgentToolPermissions('coordinator');
      
      assert.ok(permissions);
      assert.strictEqual(permissions.type, 'specific');
      assert.ok(permissions.tools?.includes('delegateWork'));
      assert.ok(permissions.tools?.includes('reportOut'));
    });

    test('should get tool permissions for custom agent', async () => {
      const permissions = await toolFilter.getAgentToolPermissions('test-agent');
      
      assert.ok(permissions);
      assert.strictEqual(permissions.type, 'specific');
      assert.deepStrictEqual(permissions.tools, ['tool1', 'tool2']);
    });

    test('should return null for non-existent agent', async () => {
      const permissions = await toolFilter.getAgentToolPermissions('non-existent');
      assert.strictEqual(permissions, null);
    });
  });

  suite('Tool Names', () => {
    test('should get all available tool names', () => {
      const toolNames = toolFilter.getAllToolNames();
      
      assert.ok(Array.isArray(toolNames));
      assert.ok(toolNames.includes('tool1'));
      assert.ok(toolNames.includes('tool2'));
      assert.ok(toolNames.includes('delegateWork'));
      assert.ok(toolNames.includes('reportOut'));
    });

    test('should handle tools with different name properties', () => {
      const mixedTools = [
        { name: 'namedTool' },
        { id: 'idTool' },
        { toolName: 'toolNameTool' },
        'stringTool',
        { description: 'unnamed' }
      ];

      toolFilter.setAvailableTools(mixedTools);
      const toolNames = toolFilter.getAllToolNames();

      assert.ok(toolNames.includes('namedTool'));
      assert.ok(toolNames.includes('idTool'));
      assert.ok(toolNames.includes('toolNameTool'));
      assert.ok(toolNames.includes('stringTool'));
      assert.ok(toolNames.includes('unknown')); // for the unnamed tool
    });
  });
});