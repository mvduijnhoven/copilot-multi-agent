import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
	files: 'out/test/**/*.test.js',
	version: '1.105.0',
	workspaceFolder: './test-workspace',
	mocha: {
		ui: 'tdd',
		timeout: 20000
	},
	// Extension development path for our extension
	extensionDevelopmentPath: '.',
	// Install required dependencies
	extensionTestsPath: './out/test',
	// Don't disable all extensions, but allow GitHub Copilot Chat
	launchArgs: [
		'--disable-extension', 'ms-vscode.vscode-typescript-next',
		'--disable-extension', 'ms-vscode.js-debug',
		'--disable-extension', 'ms-vscode.references-view'
	]
});
