import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
	files: 'out/test/**/*.test.js',
	version: '1.105.0',
	workspaceFolder: './test-workspace',
	mocha: {
		ui: 'tdd',
		timeout: 30000
	},
	// Don't load our extension to avoid dependency issues
	// Tests will use mocked components instead
	launchArgs: [
		'--disable-extensions',
		'--disable-workspace-trust'
	],
	// Use a minimal test environment
	extensionTestsPath: './out/test'
});