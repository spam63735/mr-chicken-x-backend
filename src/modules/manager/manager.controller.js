const managerService = require('./manager.service');

/* ========= CREATE TRIP ========= */
exports.createTrip = async (req, res) => {
  try {
    const result = await managerService.createTrip(
      req.user.companyId,
      req.body
    );
    res.status(201).json(result);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

/* ========= GET TRIPS ========= */
exports.getTrips = async (req, res) => {
  try {
    res.json(await managerService.getTrips(req.user.companyId));
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

/* ========= VIEW TRIP SALES ========= */
exports.getTripSales = async (req, res) => {
  try {
    res.json(
      await managerService.getTripSales(
        req.user.companyId,
        req.params.tripId
      )
    );
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

/* ========= CLOSE DAY ========= */
exports.closeDay = async (req, res) => {
  try {
    res.json(
      await managerService.closeDay(
        req.user.companyId,
        req.params.tripId,
        req.body
      )
    );
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};
