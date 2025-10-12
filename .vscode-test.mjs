import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
	files: 'out/test/**/*.test.js',
	version: '1.105.0',
	workspaceFolder: './test-workspace',
	mocha: {
		ui: 'tdd',
		timeout: 20000
	},
	// Skip extension installation since dependencies should already be available
	extensionDevelopmentPath: '.',
	launchArgs: ['--disable-extensions']
});
