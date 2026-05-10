#!/usr/bin/env node
/**
 * Smart Start Script with Port Conflict Resolution
 * 
 * This script handles common startup issues:
 * - Port conflicts (finds next available port)
 * - Environment validation
 * - Clear error messages
 */

const { execSync, spawn } = require('child_process');
const net = require('net');

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

function checkPort(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        resolve(false);
      } else {
        resolve(false);
      }
    });
    
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    
    server.listen(port);
  });
}

async function findAvailablePort(startPort = 3000, maxAttempts = 10) {
  log(`🔍 Checking ports ${startPort}-${startPort + maxAttempts - 1}...\n`, 'cyan');
  
  for (let i = 0; i < maxAttempts; i++) {
    const port = startPort + i;
    const isAvailable = await checkPort(port);
    
    if (isAvailable) {
      return port;
    } else {
      log(`  Port ${port} is busy`, 'yellow');
    }
  }
  
  throw new Error(`No available ports found between ${startPort} and ${startPort + maxAttempts - 1}`);
}

async function main() {
  console.log('\n🚀 ipaShip Smart Start\n');
  
  // Step 1: Environment validation
  log('📋 Step 1: Validating environment...\n', 'blue');
  
  try {
    execSync('node scripts/validate-env.js', { stdio: 'inherit' });
  } catch (error) {
    log('\n❌ Environment validation failed', 'red');
    log('Please fix the issues above and try again.\n', 'yellow');
    process.exit(1);
  }
  
  // Step 2: Find available port
  log('\n📋 Step 2: Finding available port...\n', 'blue');
  
  const preferredPort = parseInt(process.env.PORT, 10) || 3000;
  
  try {
    const availablePort = await findAvailablePort(preferredPort);
    
    if (availablePort !== preferredPort) {
      log(`\n⚠️  Port ${preferredPort} is busy`, 'yellow');
      log(`✅ Using port ${availablePort} instead\n`, 'green');
    } else {
      log(`✅ Port ${availablePort} is available\n`, 'green');
    }
    
    // Step 3: Start the application
    log('📋 Step 3: Starting Next.js...\n', 'blue');
    
    const nextProcess = spawn('npx', ['next', 'dev', '-p', availablePort.toString()], {
      stdio: 'inherit',
      shell: true,
    });
    
    nextProcess.on('error', (error) => {
      log(`\n❌ Failed to start Next.js: ${error.message}`, 'red');
      process.exit(1);
    });
    
    nextProcess.on('exit', (code) => {
      process.exit(code);
    });
    
  } catch (error) {
    log(`\n❌ ${error.message}`, 'red');
    log('Please free up a port or set PORT environment variable\n', 'yellow');
    process.exit(1);
  }
}

main();
