#!/usr/bin/env node

/**
 * Test runner for comprehensive test suite validation
 * Runs a subset of tests to verify the comprehensive test suite is working
 */

const { execSync } = require('child_process');

const testPatterns = [
  'should initialize single agent quickly',
  'should complete simple coordinator-to-agent delegation',
  'should return empty array for agent with "none" delegation permissions',
  'should initialize agent with extended system prompt when delegation targets available',
  'should validate all test files are properly structured'
];

console.log('🧪 Running Comprehensive Test Suite Validation...\n');

let passedTests = 0;
let totalTests = testPatterns.length;

for (const pattern of testPatterns) {
  try {
    console.log(`Testing: ${pattern}`);
    execSync(`npm test -- --grep "${pattern}"`, { 
      stdio: 'pipe',
      timeout: 30000 
    });
    console.log('✅ PASSED\n');
    passedTests++;
  } catch (error) {
    console.log('❌ FAILED');
    console.log(`Error: ${error.message}\n`);
  }
}

console.log('📊 Test Results Summary:');
console.log(`✅ Passed: ${passedTests}/${totalTests}`);
console.log(`❌ Failed: ${totalTests - passedTests}/${totalTests}`);

if (passedTests === totalTests) {
  console.log('\n🎉 All comprehensive test suite validation tests passed!');
  console.log('The comprehensive test suite is working correctly.');
  process.exit(0);
} else {
  console.log('\n⚠️  Some tests failed. Please check the test implementations.');
  process.exit(1);
}