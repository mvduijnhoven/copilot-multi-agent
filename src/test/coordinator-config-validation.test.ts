/**
 * Simple test to validate coordinator configuration handling
 */

import * as assert from 'assert';
import { validateConfiguration } from '../services/configuration-validator';

suite('Coordinator Configuration Validation', () => {
  test('should accept coordinator configuration with name field', async () => {
    const configWithName = {
      coordinator: {
        name: 'coordinator' as const,
        systemPrompt: 'Test prompt',
        description: 'Test description',
        useFor: 'Testing',
        delegationPermissions: { type: 'all' as const },
        toolPermissions: { type: 'all' as const }
      },
      customAgents: []
    };

    const result = await validateConfiguration(configWithName, 'test');
    assert.strictEqual(result.isValid, true, 'Configuration with coordinator name should be valid');
    assert.strictEqual(result.config.coordinator.name, 'coordinator', 'Coordinator name should be preserved');
  });

  test('should handle coordinator configuration without name field by adding it', async () => {
    const configWithoutName = {
      coordinator: {
        systemPrompt: 'Test prompt',
        description: 'Test description',
        useFor: 'Testing',
        delegationPermissions: { type: 'all' as const },
        toolPermissions: { type: 'all' as const }
      } as any, // Cast to any to simulate missing name field
      customAgents: []
    };

    const result = await validateConfiguration(configWithoutName, 'test');
    
    // The validator should either fix it or provide a valid default
    if (result.isValid) {
      assert.strictEqual(result.config.coordinator.name, 'coordinator', 'Coordinator name should be automatically set');
    } else {
      // If validation fails, it should provide a default configuration with proper name
      assert.ok(result.config.coordinator.name === 'coordinator', 'Default coordinator should have correct name');
    }
  });

  test('should reject coordinator with wrong name', async () => {
    const configWithWrongName = {
      coordinator: {
        name: 'wrong-name' as any,
        systemPrompt: 'Test prompt',
        description: 'Test description',
        useFor: 'Testing',
        delegationPermissions: { type: 'all' as const },
        toolPermissions: { type: 'all' as const }
      },
      customAgents: []
    };

    const result = await validateConfiguration(configWithWrongName, 'test');
    
    // Should either fix the name or be invalid
    if (result.isValid) {
      assert.strictEqual(result.config.coordinator.name, 'coordinator', 'Wrong coordinator name should be fixed to "coordinator"');
    } else {
      assert.ok(result.errors.some(error => error.includes('coordinator.name')), 'Should have error about coordinator name');
    }
  });
});