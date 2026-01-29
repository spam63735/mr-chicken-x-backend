const express = require('express');
const router = express.Router();

const authRoutes = require('./modules/auth/auth.routes');
const platformRoutes = require('./modules/platform/platform.routes');
const traderRoutes = require('./modules/trader/trader.routes');
const driverRoutes = require('./modules/driver/driver.routes');

router.use('/auth', authRoutes);
router.use('/platform', platformRoutes);
router.use('/trader', traderRoutes);
router.use('/driver', driverRoutes);

module.exports = router;
