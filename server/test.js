console.log('Test script starting...');

try {
  console.log('Testing basic functionality...');
  
  // Test logger import
  console.log('Importing logger...');
  require('./utils/logger');
  console.log('Logger imported successfully');
  
  // Test database import
  console.log('Importing database...');
  require('./config/database');
  console.log('Database module imported successfully');
  
  console.log('All imports successful!');
} catch (error) {
  console.error('Error during import:', error);
  process.exit(1);
}