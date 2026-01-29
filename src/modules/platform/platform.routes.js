const express = require('express');
const   router = express.Router();

const authMiddleware = require('../../middlewares/auth.middleware');
const adminMiddleware = require('../../middlewares/admin.middleware');
const platformController = require('./platform.controller');

// Create Trader
router.post(
  '/traders',
  authMiddleware,
  adminMiddleware,
  platformController.createTrader
);

// List Traders
router.get(
  '/traders',
  authMiddleware,
  adminMiddleware,
  platformController.getTraders
);

// View Trader Details
router.get(
  '/traders/:id',
  authMiddleware,
  adminMiddleware,
  platformController.getTraderById
);

// Edit Trader Info
router.patch(
  '/traders/:id',
  authMiddleware,
  adminMiddleware,
  platformController.updateTrader
);

// Enable / Disable Trader
router.patch(
  '/traders/:id/status',
  authMiddleware,
  adminMiddleware,
  platformController.updateTraderStatus
);

// Platform Dashboard
router.get(
  '/dashboard',
  authMiddleware,
  adminMiddleware,
  platformController.getPlatformDashboard
);

router.delete(
  '/traders/:id',
  authMiddleware,
  adminMiddleware,
  platformController.deleteTrader
);


module.exports = router;
