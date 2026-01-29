const platformService = require('./platform.service');

exports.createTrader = async (req, res) => {
  try {
    const result = await platformService.createTrader(req.body);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.getTraders = async (req, res) => {
  try {
    const traders = await platformService.getTraders();
    res.json(traders);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.getTraderById = async (req, res) => {
  try {
    const trader = await platformService.getTraderById(req.params.id);
    res.json(trader);
  } catch (err) {
    res.status(404).json({ message: err.message });
  }
};

exports.updateTrader = async (req, res) => {
  try {
    const result = await platformService.updateTrader(
      req.params.id,
      req.body
    );
    res.json(result);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.updateTraderStatus = async (req, res) => {
  try {
    const result = await platformService.updateTraderStatus(
      req.params.id,
      req.body.status
    );
    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};


exports.getPlatformDashboard = async (req, res) => {
  try {
    const dashboard = await platformService.getPlatformDashboard();
    res.json(dashboard);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};


exports.deleteTrader = async (req, res) => {
  try {
    const result = await platformService.deleteTrader(req.params.id);
    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};
