const express = require('express');
const router = express.Router();

const authMiddleware = require('../../middlewares/auth.middleware');
const managerController = require('./manager.controller');

/* ================= TRIPS ================= */
/**
 * Manager CAN create trips
 * Manager CAN view trips
 */
router.post(
  '/trips',
  authMiddleware,
  managerController.createTrip
);

router.get(
  '/trips',
  authMiddleware,
  managerController.getTrips
);

/* ================= SALES ================= */
/**
 * Manager views sales for verification
 */
router.get(
  '/trips/:tripId/sales',
  authMiddleware,
  managerController.getTripSales
);

/* ================= DAY CLOSE ================= */
/**
 * Manager verifies cash + adds expenses + closes day
 */
router.post(
  '/trips/:tripId/close-day',
  authMiddleware,
  managerController.closeDay
);

module.exports = router;
