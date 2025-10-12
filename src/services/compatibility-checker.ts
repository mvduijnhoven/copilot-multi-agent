/**
 * Compatibility checker service for ensuring seamless integration with VS Code and GitHub Copilot
 */

import * as vscode from 'vscode';
import { ConfigurationError } from '../models/errors';

/**
 * Compatibility check result
 */
export interface CompatibilityResult {
  isCompatible: boolean;
  warnings: string[];
  errors: string[];
  recommendations: string[];
  vscodeVersion: string;
  requiredFeatures: FeatureAvailability;
}

/**
 * Feature availability information
 */
export interface FeatureAvailability {
  chatParticipantAPI: boolean;
  languageModelAPI: boolean;
  configurationAPI: boolean;
  commandAPI: boolean;
  extensionAPI: boolean;
}

/**
 * Compatibility requirements
 */
interface CompatibilityRequirements {
  minVSCodeVersion: string;
  requiredAPIs: string[];
  recommendedExtensions: string[];
  conflictingExtensions: string[];
}

/**
 * Compatibility checker service
 */
export class CompatibilityChecker {
  private static readonly REQUIREMENTS: CompatibilityRequirements = {
    minVSCodeVersion: '1.105.0',
    requiredAPIs: [
      'vscode.chat',
      'vscode.workspace',
      'vscode.commands',
      'vscode.window'
    ],
    recommendedExtensions: [
      'GitHub.copilot',
      'GitHub.copilot-chat'
    ],
    conflictingExtensions: [
      // Add any known conflicting extensions here
    ]
  };

  /**
   * Performs comprehensive compatibility check
   */
  static async checkCompatibility(): Promise<CompatibilityResult> {
    const warnings: string[] = [];
    const errors: string[] = [];
    const recommendations: string[] = [];

    // Get VS Code version
    const vscodeVersion = vscode.version;

    // Check VS Code version compatibility
    const versionCheck = this.checkVSCodeVersion(vscodeVersion);
    if (!versionCheck.isCompatible) {
      errors.push(...versionCheck.errors);
      warnings.push(...versionCheck.warnings);
    }

    // Check API availability
    const featureAvailability = await this.checkFeatureAvailability();
    const apiCheck = this.checkRequiredAPIs(featureAvailability);
    if (!apiCheck.isCompatible) {
      errors.push(...apiCheck.errors);
      warnings.push(...apiCheck.warnings);
    }

    // Check extension compatibility
    const extensionCheck = await this.checkExtensionCompatibility();
    warnings.push(...extensionCheck.warnings);
    recommendations.push(...extensionCheck.recommendations);

    // Check GitHub Copilot integration
    const copilotCheck = await this.checkGitHubCopilotIntegration();
    if (!copilotCheck.isCompatible) {
      warnings.push(...copilotCheck.warnings);
      recommendations.push(...copilotCheck.recommendations);
    }

    // Overall compatibility assessment
    const isCompatible = errors.length === 0;

    return {
      isCompatible,
      warnings,
      errors,
      recommendations,
      vscodeVersion,
      requiredFeatures: featureAvailability
    };
  }

  /**
   * Checks VS Code version compatibility
   */
  private static checkVSCodeVersion(currentVersion: string): {
    isCompatible: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      const current = this.parseVersion(currentVersion);
      const required = this.parseVersion(this.REQUIREMENTS.minVSCodeVersion);

      if (this.compareVersions(current, required) < 0) {
        errors.push(
          `VS Code version ${currentVersion} is not supported. ` +
          `Minimum required version is ${this.REQUIREMENTS.minVSCodeVersion}.`
        );
      } else {
        // Check for known issues with specific versions
        const knownIssues = this.getKnownVersionIssues(currentVersion);
        warnings.push(...knownIssues);
      }
    } catch (error) {
      warnings.push(`Unable to parse VS Code version: ${currentVersion}`);
    }

    return {
      isCompatible: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Checks availability of required VS Code APIs
   */
  private static async checkFeatureAvailability(): Promise<FeatureAvailability> {
    return {
      chatParticipantAPI: this.isAPIAvailable('vscode.chat'),
      languageModelAPI: this.isAPIAvailable('vscode.lm') || this.isAPIAvailable('vscode.chat.languageModel'),
      configurationAPI: this.isAPIAvailable('vscode.workspace.getConfiguration'),
      commandAPI: this.isAPIAvailable('vscode.commands'),
      extensionAPI: this.isAPIAvailable('vscode.extensions')
    };
  }

  /**
   * Checks if required APIs are available
   */
  private static checkRequiredAPIs(features: FeatureAvailability): {
    isCompatible: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check critical APIs
    if (!features.chatParticipantAPI) {
      errors.push(
        'VS Code Chat Participant API is not available. ' +
        'This extension requires VS Code with Chat API support.'
      );
    }

    if (!features.configurationAPI) {
      errors.push('VS Code Configuration API is not available.');
    }

    if (!features.commandAPI) {
      errors.push('VS Code Command API is not available.');
    }

    // Check optional but recommended APIs
    if (!features.languageModelAPI) {
      warnings.push(
        'Language Model API is not available. ' +
        'Some advanced features may not work properly.'
      );
    }

    return {
      isCompatible: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Checks compatibility with other extensions
   */
  private static async checkExtensionCompatibility(): Promise<{
    warnings: string[];
    recommendations: string[];
  }> {
    const warnings: string[] = [];
    const recommendations: string[] = [];

    try {
      const extensions = vscode.extensions.all;

      // Check for recommended extensions
      for (const recommendedId of this.REQUIREMENTS.recommendedExtensions) {
        const extension = extensions.find(ext => ext.id === recommendedId);
        if (!extension) {
          recommendations.push(
            `Consider installing the "${recommendedId}" extension for better integration.`
          );
        } else if (!extension.isActive) {
          warnings.push(
            `The "${recommendedId}" extension is installed but not active. ` +
            'Some features may not work as expected.'
          );
        }
      }

      // Check for conflicting extensions
      for (const conflictingId of this.REQUIREMENTS.conflictingExtensions) {
        const extension = extensions.find(ext => ext.id === conflictingId);
        if (extension && extension.isActive) {
          warnings.push(
            `The "${conflictingId}" extension may conflict with multi-agent functionality.`
          );
        }
      }

      // Check for multiple chat participants
      const chatExtensions = extensions.filter(ext => 
        ext.isActive && 
        ext.packageJSON?.contributes?.chatParticipants
      );

      if (chatExtensions.length > 5) {
        warnings.push(
          `Multiple chat participant extensions detected (${chatExtensions.length}). ` +
          'This may impact performance.'
        );
      }

    } catch (error) {
      warnings.push('Unable to check extension compatibility.');
    }

    return { warnings, recommendations };
  }

  /**
   * Checks GitHub Copilot integration
   */
  private static async checkGitHubCopilotIntegration(): Promise<{
    isCompatible: boolean;
    warnings: string[];
    recommendations: string[];
  }> {
    const warnings: string[] = [];
    const recommendations: string[] = [];

    try {
      const copilotExtension = vscode.extensions.getExtension('GitHub.copilot');
      const copilotChatExtension = vscode.extensions.getExtension('GitHub.copilot-chat');

      if (!copilotExtension) {
        recommendations.push(
          'GitHub Copilot extension is not installed. ' +
          'Install it for full multi-agent functionality.'
        );
      } else if (!copilotExtension.isActive) {
        warnings.push(
          'GitHub Copilot extension is not active. ' +
          'Multi-agent features may not work properly.'
        );
      }

      if (!copilotChatExtension) {
        recommendations.push(
          'GitHub Copilot Chat extension is not installed. ' +
          'Install it for chat-based multi-agent interactions.'
        );
      } else if (!copilotChatExtension.isActive) {
        warnings.push(
          'GitHub Copilot Chat extension is not active. ' +
          'Chat functionality may be limited.'
        );
      }

      // Check if chat API is available
      if (!this.isAPIAvailable('vscode.chat')) {
        warnings.push(
          'VS Code Chat API is not available. ' +
          'Update VS Code to a version that supports the Chat API.'
        );
      }

    } catch (error) {
      warnings.push('Unable to check GitHub Copilot integration.');
    }

    return {
      isCompatible: warnings.length === 0,
      warnings,
      recommendations
    };
  }

  /**
   * Checks if a specific API is available
   */
  private static isAPIAvailable(apiPath: string): boolean {
    try {
      const parts = apiPath.split('.');
      let current: any = vscode;

      for (const part of parts.slice(1)) { // Skip 'vscode' part
        if (current && typeof current === 'object' && part in current) {
          current = current[part];
        } else {
          return false;
        }
      }

      return current !== undefined;
    } catch {
      return false;
    }
  }

  /**
   * Parses version string into comparable format
   */
  private static parseVersion(version: string): number[] {
    return version.split('.').map(part => {
      const num = parseInt(part.replace(/[^\d]/g, ''), 10);
      return isNaN(num) ? 0 : num;
    });
  }

  /**
   * Compares two version arrays
   */
  private static compareVersions(version1: number[], version2: number[]): number {
    const maxLength = Math.max(version1.length, version2.length);
    
    for (let i = 0; i < maxLength; i++) {
      const v1 = version1[i] || 0;
      const v2 = version2[i] || 0;
      
      if (v1 < v2) {
        return -1;
      }
      if (v1 > v2) {
        return 1;
      }
    }
    
    return 0;
  }

  /**
   * Gets known issues for specific VS Code versions
   */
  private static getKnownVersionIssues(version: string): string[] {
    const issues: string[] = [];

    // Add known version-specific issues here
    // Example:
    // if (version.startsWith('1.105.')) {
    //   issues.push('VS Code 1.105.x has known issues with chat participant icons.');
    // }

    return issues;
  }

  /**
   * Performs runtime compatibility check
   */
  static async performRuntimeCheck(): Promise<{
    canProceed: boolean;
    fallbackMode: boolean;
    issues: string[];
  }> {
    const issues: string[] = [];
    let canProceed = true;
    let fallbackMode = false;

    try {
      // Check if chat API is working
      if (!this.isAPIAvailable('vscode.chat.createChatParticipant')) {
        issues.push('Chat Participant API is not functional');
        fallbackMode = true;
      }

      // Check if configuration API is working
      try {
        vscode.workspace.getConfiguration('test');
      } catch (error) {
        issues.push('Configuration API is not functional');
        canProceed = false;
      }

      // Check if command API is working
      try {
        // Test command registration (will be disposed immediately)
        const testCommand = vscode.commands.registerCommand('test.compatibility', () => {});
        testCommand.dispose();
      } catch (error) {
        issues.push('Command API is not functional');
        fallbackMode = true;
      }

    } catch (error) {
      issues.push(`Runtime check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      canProceed = false;
    }

    return {
      canProceed,
      fallbackMode,
      issues
    };
  }

  /**
   * Gets compatibility recommendations based on current environment
   */
  static async getRecommendations(): Promise<string[]> {
    const recommendations: string[] = [];
    const compatibility = await this.checkCompatibility();

    if (!compatibility.isCompatible) {
      recommendations.push('Update VS Code to the latest version');
      recommendations.push('Ensure GitHub Copilot extensions are installed and active');
    }

    if (compatibility.warnings.length > 0) {
      recommendations.push('Review compatibility warnings in the extension logs');
    }

    if (!compatibility.requiredFeatures.chatParticipantAPI) {
      recommendations.push('Enable VS Code Insiders or update to a version with Chat API support');
    }

    return recommendations;
  }

  /**
   * Creates a compatibility report for diagnostics
   */
  static async createCompatibilityReport(): Promise<string> {
    const compatibility = await this.checkCompatibility();
    const runtime = await this.performRuntimeCheck();

    const report = [
      '=== Multi-Agent Extension Compatibility Report ===',
      '',
      `VS Code Version: ${compatibility.vscodeVersion}`,
      `Overall Compatibility: ${compatibility.isCompatible ? '✅ Compatible' : '❌ Not Compatible'}`,
      `Runtime Status: ${runtime.canProceed ? '✅ Functional' : '❌ Issues Detected'}`,
      `Fallback Mode: ${runtime.fallbackMode ? '⚠️ Required' : '✅ Not Required'}`,
      '',
      '--- Feature Availability ---',
      `Chat Participant API: ${compatibility.requiredFeatures.chatParticipantAPI ? '✅' : '❌'}`,
      `Language Model API: ${compatibility.requiredFeatures.languageModelAPI ? '✅' : '❌'}`,
      `Configuration API: ${compatibility.requiredFeatures.configurationAPI ? '✅' : '❌'}`,
      `Command API: ${compatibility.requiredFeatures.commandAPI ? '✅' : '❌'}`,
      `Extension API: ${compatibility.requiredFeatures.extensionAPI ? '✅' : '❌'}`,
      ''
    ];

    if (compatibility.errors.length > 0) {
      report.push('--- Errors ---');
      compatibility.errors.forEach(error => report.push(`❌ ${error}`));
      report.push('');
    }

    if (compatibility.warnings.length > 0) {
      report.push('--- Warnings ---');
      compatibility.warnings.forEach(warning => report.push(`⚠️ ${warning}`));
      report.push('');
    }

    if (compatibility.recommendations.length > 0) {
      report.push('--- Recommendations ---');
      compatibility.recommendations.forEach(rec => report.push(`💡 ${rec}`));
      report.push('');
    }

    if (runtime.issues.length > 0) {
      report.push('--- Runtime Issues ---');
      runtime.issues.forEach(issue => report.push(`🔧 ${issue}`));
      report.push('');
    }

    report.push('=== End of Report ===');

    return report.join('\n');
  }
}

/**
 * Graceful degradation manager
 */
export class GracefulDegradationManager {
  private fallbackMode: boolean = false;
  private disabledFeatures: Set<string> = new Set();
  private compatibilityIssues: string[] = [];

  constructor() {}

  /**
   * Initializes graceful degradation based on compatibility check
   */
  async initialize(): Promise<void> {
    const compatibility = await CompatibilityChecker.checkCompatibility();
    const runtime = await CompatibilityChecker.performRuntimeCheck();

    this.fallbackMode = runtime.fallbackMode;
    this.compatibilityIssues = [...compatibility.errors, ...compatibility.warnings, ...runtime.issues];

    // Disable features based on compatibility issues
    if (!compatibility.requiredFeatures.chatParticipantAPI) {
      this.disabledFeatures.add('chatParticipant');
    }

    if (!compatibility.requiredFeatures.languageModelAPI) {
      this.disabledFeatures.add('languageModel');
    }

    if (!runtime.canProceed) {
      this.disabledFeatures.add('fullFunctionality');
    }
  }

  /**
   * Checks if a feature is available
   */
  isFeatureAvailable(feature: string): boolean {
    return !this.disabledFeatures.has(feature);
  }

  /**
   * Gets fallback behavior for a disabled feature
   */
  getFallbackBehavior(feature: string): string | null {
    const fallbacks: Record<string, string> = {
      'chatParticipant': 'Use command palette commands instead of chat interface',
      'languageModel': 'Limited to basic functionality without AI assistance',
      'delegation': 'Single-agent mode only',
      'fullFunctionality': 'Extension running in compatibility mode'
    };

    return fallbacks[feature] || null;
  }

  /**
   * Checks if extension is in fallback mode
   */
  isInFallbackMode(): boolean {
    return this.fallbackMode;
  }

  /**
   * Gets compatibility issues
   */
  getCompatibilityIssues(): string[] {
    return [...this.compatibilityIssues];
  }

  /**
   * Gets disabled features
   */
  getDisabledFeatures(): string[] {
    return Array.from(this.disabledFeatures);
  }

  /**
   * Attempts to enable a feature if compatibility allows
   */
  async attemptFeatureEnable(feature: string): Promise<boolean> {
    // Re-check compatibility for the specific feature
    const compatibility = await CompatibilityChecker.checkCompatibility();
    
    switch (feature) {
      case 'chatParticipant':
        if (compatibility.requiredFeatures.chatParticipantAPI) {
          this.disabledFeatures.delete(feature);
          return true;
        }
        break;
      
      case 'languageModel':
        if (compatibility.requiredFeatures.languageModelAPI) {
          this.disabledFeatures.delete(feature);
          return true;
        }
        break;
    }

    return false;
  }

  /**
   * Creates a user-friendly status message
   */
  getStatusMessage(): string {
    if (!this.fallbackMode && this.disabledFeatures.size === 0) {
      return '✅ All features are available and working normally.';
    }

    const messages: string[] = [];

    if (this.fallbackMode) {
      messages.push('⚠️ Extension is running in compatibility mode.');
    }

    if (this.disabledFeatures.size > 0) {
      messages.push(`🔧 Some features are disabled: ${Array.from(this.disabledFeatures).join(', ')}`);
    }

    if (this.compatibilityIssues.length > 0) {
      messages.push(`📋 ${this.compatibilityIssues.length} compatibility issue(s) detected.`);
    }

    return messages.join(' ');
  }
}