const driverService = require('./driver.service');

// View assigned trips
exports.getAssignedTrips = async (req, res) => {
  try {
    const trips = await driverService.getAssignedTrips(req.user);
    res.json(trips);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

// Lift trip
exports.addCageEntry = async (req, res) => {
  try {
    const result = await driverService.addCageEntry(
      req.user,
      req.params.tripId,
      req.params.cageNumber,
      req.body
    );
    res.json(result);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

exports.resetCage = async (req, res) => {
  try {
    const result = await driverService.resetCage(
      req.user,
      req.params.tripId,
      req.params.cageNumber
    );
    res.json(result);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

exports.completeTrip = async (req, res) => {
  try {
    const result = await driverService.completeTrip(
      req.user,
      req.params.tripId
    );
    res.json(result);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

exports.getTripCages = async (req, res) => {
  try {
    const data = await driverService.getTripCages(
      req.user,
      req.params.tripId
    );
    res.json(data);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};


// Sell to customer
exports.sellToCustomer = async (req, res) => {
  try {
    const result = await driverService.sellToCustomer(
      req.user,
      req.params.tripId,
      req.body
    );
    res.json(result);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};