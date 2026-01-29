const express = require('express');
const router = express.Router();

const authMiddleware = require('../../middlewares/auth.middleware');
const driverController = require('./driver.controller');

// 1️⃣ View assigned trips
router.get(
  '/trips',
  authMiddleware,
  driverController.getAssignedTrips
);

// 2️⃣ Lift chickens from farm
router.post(
  '/trips/:tripId/cages/:cageNumber/entries',
  authMiddleware,
  driverController.addCageEntry
);

router.delete(
  '/trips/:tripId/cages/:cageNumber',
  authMiddleware,
  driverController.resetCage
);

router.post(
  '/trips/:tripId/complete',
  authMiddleware,
  driverController.completeTrip
);

router.get(
  '/trips/:tripId/cages',
  authMiddleware,
  driverController.getTripCages
);


// 3️⃣ Sell to customer
router.post(
  '/trips/:tripId/sell',
  authMiddleware,
  driverController.sellToCustomer
);

module.exports = router;    