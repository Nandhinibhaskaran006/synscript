const express = require('express');
const router = express.Router();
const { executeCode } = require('../controllers/executeController');

// @route   POST /api/execute
// @desc    Execute code snippet in child process
// @access  Public / Protected
router.post('/', executeCode);

module.exports = router;
