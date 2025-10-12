#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🔍 Checking build configuration...\n');

// Check package.json
const packagePath = path.join(__dirname, '..', 'package.json');
if (!fs.existsSync(packagePath)) {
  console.error('❌ package.json not found');
  process.exit(1);
}

const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

// Verify required fields
const requiredFields = [
  'name', 'displayName', 'description', 'version', 'publisher',
  'engines', 'categories', 'main', 'contributes'
];

let hasErrors = false;

requiredFields.forEach(field => {
  if (!pkg[field]) {
    console.error(`❌ Missing required field: ${field}`);
    hasErrors = true;
  } else {
    console.log(`✅ ${field}: ${typeof pkg[field] === 'object' ? 'configured' : pkg[field]}`);
  }
});

// Check main entry point
const mainPath = path.join(__dirname, '..', pkg.main || 'dist/extension.js');
if (!fs.existsSync(mainPath)) {
  console.warn(`⚠️  Main entry point not found: ${pkg.main}`);
  console.log('   Run "npm run compile" to build the extension');
}

// Check for LICENSE
const licensePath = path.join(__dirname, '..', 'LICENSE');
if (!fs.existsSync(licensePath)) {
  console.warn('⚠️  LICENSE file not found');
} else {
  console.log('✅ LICENSE file exists');
}

// Check for CHANGELOG
const changelogPath = path.join(__dirname, '..', 'CHANGELOG.md');
if (!fs.existsSync(changelogPath)) {
  console.warn('⚠️  CHANGELOG.md not found');
} else {
  console.log('✅ CHANGELOG.md exists');
}

// Check .vscodeignore
const vscodeignorePath = path.join(__dirname, '..', '.vscodeignore');
if (!fs.existsSync(vscodeignorePath)) {
  console.warn('⚠️  .vscodeignore not found');
} else {
  console.log('✅ .vscodeignore exists');
}

console.log('\n📦 Package configuration:');
console.log(`   Name: ${pkg.name}`);
console.log(`   Version: ${pkg.version}`);
console.log(`   Publisher: ${pkg.publisher}`);
console.log(`   VS Code Engine: ${pkg.engines?.vscode}`);

if (hasErrors) {
  console.error('\n❌ Build check failed. Please fix the errors above.');
  process.exit(1);
} else {
  console.log('\n✅ Build configuration looks good!');
  console.log('\nNext steps:');
  console.log('1. Update publisher name in package.json');
  console.log('2. Update repository URLs');
  console.log('3. Create extension icon (128x128 PNG)');
  console.log('4. Run "npm run package:vsix" to create distributable package');
}