const express = require('express');
const router = express.Router();

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'rag' });
});

// Status endpoint
router.get('/status', (req, res) => {
  res.json({ 
    status: 'active',
    service: 'rag',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
