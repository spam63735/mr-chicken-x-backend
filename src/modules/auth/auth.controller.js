const authService = require('./auth.service');

exports.login = async (req, res) => {
  try {
    const { mobile, password } = req.body;

    if (!mobile || !password) {
      return res.status(400).json({
        message: 'Mobile and password are required'
      });
    }

    const result = await authService.login(mobile, password);

    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(401).json({
      message: error.message || 'Invalid credentials'
    });
  }
};
