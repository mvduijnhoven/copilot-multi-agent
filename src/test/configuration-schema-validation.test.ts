/**
 * Simple validation test for configuration schema
 * This test validates that the package.json configuration schema is properly defined
 */

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';

suite('Configuration Schema Validation Tests', () => {
  let packageJson: any;

  setup(() => {
    const packagePath = path.join(__dirname, '../../package.json');
    const packageContent = fs.readFileSync(packagePath, 'utf8');
    packageJson = JSON.parse(packageContent);
  });

  suite('Package.json Configuration Schema', () => {
    test('should have configuration contribution defined', () => {
      assert.ok(packageJson.contributes, 'Package should have contributes section');
      assert.ok(packageJson.contributes.configuration, 'Package should have configuration contribution');
    });

    test('should have proper configuration title', () => {
      const config = packageJson.contributes.configuration;
      assert.strictEqual(config.title, 'Copilot Multi-Agent', 'Configuration should have correct title');
    });

    test('should define entryAgent property with proper constraints', () => {
      const properties = packageJson.contributes.configuration.properties;
      const entryAgent = properties['copilotMultiAgent.entryAgent'];
      
      assert.ok(entryAgent, 'entryAgent property should be defined');
      assert.strictEqual(entryAgent.type, 'string', 'entryAgent should be string type');
      assert.strictEqual(entryAgent.default, 'coordinator', 'entryAgent should have coordinator as default');
      assert.strictEqual(entryAgent.pattern, '^[a-zA-Z0-9-_]+$', 'entryAgent should have proper pattern validation');
      assert.strictEqual(entryAgent.minLength, 1, 'entryAgent should have minLength of 1');
      assert.strictEqual(entryAgent.maxLength, 50, 'entryAgent should have maxLength of 50');
    });

    test('should define agents array property with proper structure', () => {
      const properties = packageJson.contributes.configuration.properties;
      const agents = properties['copilotMultiAgent.agents'];
      
      assert.ok(agents, 'agents property should be defined');
      assert.strictEqual(agents.type, 'array', 'agents should be array type');
      assert.strictEqual(agents.minItems, 1, 'agents should have minItems of 1');
      assert.strictEqual(agents.maxItems, 20, 'agents should have maxItems of 20');
      assert.ok(agents.items, 'agents should have items definition');
    });

    test('should define agent item schema with all required properties', () => {
      const properties = packageJson.contributes.configuration.properties;
      const agentItems = properties['copilotMultiAgent.agents'].items;
      
      assert.strictEqual(agentItems.type, 'object', 'agent items should be objects');
      assert.ok(agentItems.properties, 'agent items should have properties');
      
      const requiredFields = ['name', 'systemPrompt', 'description', 'useFor', 'delegationPermissions', 'toolPermissions'];
      assert.deepStrictEqual(agentItems.required, requiredFields, 'agent items should have all required fields');
      
      // Check each required property exists
      requiredFields.forEach(field => {
        assert.ok(agentItems.properties[field], `agent items should have ${field} property`);
      });
    });

    test('should define agent name property with proper validation', () => {
      const properties = packageJson.contributes.configuration.properties;
      const agentName = properties['copilotMultiAgent.agents'].items.properties.name;
      
      assert.strictEqual(agentName.type, 'string', 'agent name should be string');
      assert.strictEqual(agentName.pattern, '^[a-zA-Z0-9-_]+$', 'agent name should have proper pattern');
      assert.strictEqual(agentName.minLength, 1, 'agent name should have minLength of 1');
      assert.strictEqual(agentName.maxLength, 50, 'agent name should have maxLength of 50');
    });

    test('should define systemPrompt with length constraints', () => {
      const properties = packageJson.contributes.configuration.properties;
      const systemPrompt = properties['copilotMultiAgent.agents'].items.properties.systemPrompt;
      
      assert.strictEqual(systemPrompt.type, 'string', 'systemPrompt should be string');
      assert.strictEqual(systemPrompt.minLength, 1, 'systemPrompt should have minLength of 1');
      assert.strictEqual(systemPrompt.maxLength, 5000, 'systemPrompt should have maxLength of 5000');
    });

    test('should define description and useFor with proper constraints', () => {
      const properties = packageJson.contributes.configuration.properties;
      const agentProps = properties['copilotMultiAgent.agents'].items.properties;
      
      const description = agentProps.description;
      assert.strictEqual(description.type, 'string', 'description should be string');
      assert.strictEqual(description.minLength, 1, 'description should have minLength of 1');
      assert.strictEqual(description.maxLength, 200, 'description should have maxLength of 200');
      
      const useFor = agentProps.useFor;
      assert.strictEqual(useFor.type, 'string', 'useFor should be string');
      assert.strictEqual(useFor.minLength, 1, 'useFor should have minLength of 1');
      assert.strictEqual(useFor.maxLength, 200, 'useFor should have maxLength of 200');
    });

    test('should define delegationPermissions with proper structure', () => {
      const properties = packageJson.contributes.configuration.properties;
      const delegationPerms = properties['copilotMultiAgent.agents'].items.properties.delegationPermissions;
      
      assert.strictEqual(delegationPerms.type, 'object', 'delegationPermissions should be object');
      assert.ok(delegationPerms.properties, 'delegationPermissions should have properties');
      assert.ok(delegationPerms.properties.type, 'delegationPermissions should have type property');
      assert.deepStrictEqual(delegationPerms.properties.type.enum, ['all', 'none', 'specific'], 
        'delegationPermissions type should have correct enum values');
      assert.deepStrictEqual(delegationPerms.required, ['type'], 'delegationPermissions should require type');
      assert.strictEqual(delegationPerms.additionalProperties, false, 'delegationPermissions should not allow additional properties');
    });

    test('should define toolPermissions with proper structure', () => {
      const properties = packageJson.contributes.configuration.properties;
      const toolPerms = properties['copilotMultiAgent.agents'].items.properties.toolPermissions;
      
      assert.strictEqual(toolPerms.type, 'object', 'toolPermissions should be object');
      assert.ok(toolPerms.properties, 'toolPermissions should have properties');
      assert.ok(toolPerms.properties.type, 'toolPermissions should have type property');
      assert.deepStrictEqual(toolPerms.properties.type.enum, ['all', 'none', 'specific'], 
        'toolPermissions type should have correct enum values');
      assert.deepStrictEqual(toolPerms.required, ['type'], 'toolPermissions should require type');
      assert.strictEqual(toolPerms.additionalProperties, false, 'toolPermissions should not allow additional properties');
    });

    test('should define default configuration with coordinator agent', () => {
      const properties = packageJson.contributes.configuration.properties;
      const defaultAgents = properties['copilotMultiAgent.agents'].default;
      
      assert.ok(Array.isArray(defaultAgents), 'default agents should be array');
      assert.strictEqual(defaultAgents.length, 1, 'should have one default agent');
      
      const coordinator = defaultAgents[0];
      assert.strictEqual(coordinator.name, 'coordinator', 'default agent should be coordinator');
      assert.ok(coordinator.systemPrompt, 'coordinator should have system prompt');
      assert.ok(coordinator.description, 'coordinator should have description');
      assert.ok(coordinator.useFor, 'coordinator should have useFor');
      assert.ok(coordinator.delegationPermissions, 'coordinator should have delegation permissions');
      assert.ok(coordinator.toolPermissions, 'coordinator should have tool permissions');
    });

    test('should define configuration management commands', () => {
      const commands = packageJson.contributes.commands;
      assert.ok(Array.isArray(commands), 'commands should be array');
      
      const expectedCommands = [
        'copilot-multi-agent.resetConfiguration',
        'copilot-multi-agent.validateConfiguration',
        'copilot-multi-agent.showStatus',
        'copilot-multi-agent.openSettings'
      ];
      
      expectedCommands.forEach(expectedCommand => {
        const command = commands.find((cmd: any) => cmd.command === expectedCommand);
        assert.ok(command, `should have ${expectedCommand} command`);
        assert.ok(command.title, `${expectedCommand} should have title`);
        assert.strictEqual(command.category, 'Multi-Agent', `${expectedCommand} should have Multi-Agent category`);
      });
    });

    test('should have proper chat participant contribution', () => {
      const chatParticipants = packageJson.contributes.chatParticipants;
      assert.ok(Array.isArray(chatParticipants), 'chatParticipants should be array');
      assert.strictEqual(chatParticipants.length, 1, 'should have one chat participant');
      
      const participant = chatParticipants[0];
      assert.strictEqual(participant.id, 'copilot-multi-agent.coordinator', 'participant should have correct id');
      assert.strictEqual(participant.name, 'multi-agent', 'participant should have correct name');
      assert.ok(participant.description, 'participant should have description');
      assert.strictEqual(participant.isSticky, true, 'participant should be sticky');
    });
  });

  suite('Configuration Schema Completeness', () => {
    test('should have all required VS Code extension fields', () => {
      const requiredFields = ['name', 'displayName', 'description', 'version', 'engines', 'main', 'contributes'];
      requiredFields.forEach(field => {
        assert.ok(packageJson[field], `package.json should have ${field} field`);
      });
    });

    test('should have proper VS Code engine version', () => {
      assert.ok(packageJson.engines.vscode, 'should specify VS Code engine version');
      assert.ok(packageJson.engines.vscode.includes('1.105.0'), 'should require VS Code 1.105.0 or higher');
    });

    test('should have GitHub Copilot Chat as extension dependency', () => {
      assert.ok(Array.isArray(packageJson.extensionDependencies), 'should have extension dependencies');
      assert.ok(packageJson.extensionDependencies.includes('github.copilot-chat'), 
        'should depend on GitHub Copilot Chat');
    });

    test('should have proper activation events', () => {
      assert.ok(Array.isArray(packageJson.activationEvents), 'should have activation events');
      assert.ok(packageJson.activationEvents.includes('onStartupFinished'), 
        'should activate on startup finished');
    });
  });
});