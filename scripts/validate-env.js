#!/usr/bin/env node
/**
 * Environment Variable Validation Script
 * 
 * This script validates that all required environment variables are set
 * before the application starts. It provides clear error messages for
 * missing variables and suggests how to fix them.
 */

const fs = require('fs');
const path = require('path');

// Required environment variables
const REQUIRED_VARS = [
  { key: 'CLERK_SECRET_KEY', description: 'Clerk authentication secret key' },
  { key: 'CLERK_PUBLISHABLE_KEY', description: 'Clerk public key for frontend' },
  { key: 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', description: 'Next.js public Clerk key' },
  { key: 'MONGODB_URI', description: 'MongoDB connection string' },
];

// Optional but recommended variables
const OPTIONAL_VARS = [
  { key: 'ANTHROPIC_API_KEY', description: 'Anthropic/Claude API key for AI audits' },
  { key: 'OPENAI_API_KEY', description: 'OpenAI API key for AI audits' },
  { key: 'NVIDIA_API_KEY', description: 'NVIDIA NIM API key for AI audits' },
  { key: 'GEMINI_API_KEY', description: 'Google Gemini API key for AI audits' },
  { key: 'OPENROUTER_API_KEY', description: 'OpenRouter API key for AI audits' },
];

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function checkEnvFile() {
  const envPath = path.join(process.cwd(), '.env');
  const envExamplePath = path.join(process.cwd(), '.env.example');
  
  if (!fs.existsSync(envPath)) {
    log('⚠️  No .env file found!', 'yellow');
    
    if (fs.existsSync(envExamplePath)) {
      log('📋 Copying .env.example to .env...', 'blue');
      fs.copyFileSync(envExamplePath, envPath);
      log('✅ Created .env from .env.example', 'green');
      log('📝 Please edit .env and add your actual API keys', 'cyan');
    } else {
      log('❌ No .env.example file found!', 'red');
      log('📝 Creating minimal .env file...', 'blue');
      
      const minimalEnv = `# ipaShip Environment Variables
# Copy this file to .env and fill in your actual values

# Clerk Authentication (Required)
CLERK_SECRET_KEY=sk_test_your_clerk_secret_key
CLERK_PUBLISHABLE_KEY=pk_test_your_clerk_publishable_key
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_your_clerk_publishable_key

# MongoDB (Required)
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/ipaship

# AI Provider API Keys (At least one required for audits)
ANTHROPIC_API_KEY=sk-ant-api03-your-key
OPENAI_API_KEY=sk-your-openai-key
NVIDIA_API_KEY=nvapi-your-nvidia-key
GEMINI_API_KEY=your-gemini-api-key
OPENROUTER_API_KEY=sk-or-v1-your-openrouter-key
`;
      fs.writeFileSync(envPath, minimalEnv);
      log('✅ Created minimal .env file', 'green');
    }
    
    return false;
  }
  
  return true;
}

function validateVariables() {
  let hasErrors = false;
  let hasWarnings = false;
  
  log('\n🔍 Checking required environment variables...\n', 'cyan');
  
  // Check required variables
  for (const { key, description } of REQUIRED_VARS) {
    const value = process.env[key];
    
    if (!value || value.trim() === '' || value.includes('your_') || value.includes('_key')) {
      log(`❌ ${key}`, 'red');
      log(`   ${description}`, 'reset');
      log(`   💡 Add ${key} to your .env file\n`, 'yellow');
      hasErrors = true;
    } else {
      const masked = value.length > 8 
        ? `${value.substring(0, 4)}...${value.substring(value.length - 4)}`
        : '****';
      log(`✅ ${key}: ${masked}`, 'green');
    }
  }
  
  // Check optional variables
  log('\n🔍 Checking optional AI provider keys...\n', 'cyan');
  
  const hasAtLeastOneAIKey = OPTIONAL_VARS.some(({ key }) => {
    const value = process.env[key];
    return value && !value.includes('your_') && !value.includes('_key');
  });
  
  if (!hasAtLeastOneAIKey) {
    log('⚠️  No AI provider API key configured', 'yellow');
    log('   At least one AI key is needed for app audits\n', 'reset');
    hasWarnings = true;
  }
  
  for (const { key, description } of OPTIONAL_VARS) {
    const value = process.env[key];
    
    if (value && !value.includes('your_') && !value.includes('_key')) {
      const masked = value.length > 8 
        ? `${value.substring(0, 4)}...${value.substring(value.length - 4)}`
        : '****';
      log(`✅ ${key}: ${masked} (${description})`, 'green');
    } else {
      log(`⏸️  ${key} (optional)`, 'reset');
    }
  }
  
  return { hasErrors, hasWarnings };
}

function checkPortAvailability() {
  const preferredPort = process.env.PORT || '3000';
  
  log(`\n🔍 Checking port ${preferredPort} availability...\n`, 'cyan');
  
  // This is a simple check - the actual port binding happens at runtime
  log(`ℹ️  App will try to use port ${preferredPort}`, 'blue');
  log('   If port is busy, Next.js will try the next available port\n', 'reset');
}

function printSummary(hasErrors, hasWarnings) {
  log('\n' + '='.repeat(50), 'cyan');
  
  if (hasErrors) {
    log('❌ VALIDATION FAILED', 'red');
    log('Please fix the missing required variables above.', 'yellow');
    log('Copy .env.example to .env and fill in your actual values.\n', 'reset');
    process.exit(1);
  } else if (hasWarnings) {
    log('⚠️  VALIDATION PASSED WITH WARNINGS', 'yellow');
    log('App will start but some features may not work.\n', 'reset');
  } else {
    log('✅ ALL CHECKS PASSED', 'green');
    log('Your environment is properly configured!\n', 'green');
  }
  
  log('='.repeat(50) + '\n', 'cyan');
}

// Main execution
console.log('\n🚀 ipaShip Environment Validator\n');

// Load .env file if exists
require('dotenv').config();

// Run checks
const hasEnvFile = checkEnvFile();

if (hasEnvFile) {
  const { hasErrors, hasWarnings } = validateVariables();
  checkPortAvailability();
  printSummary(hasErrors, hasWarnings);
} else {
  log('\n⚠️  Please configure your .env file and run again\n', 'yellow');
  process.exit(1);
}
