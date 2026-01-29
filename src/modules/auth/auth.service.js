const pool = require('../../config/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

exports.login = async (mobile, password) => {

  /* ================= SUPERADMIN STATIC LOGIN ================= */
  if (
    mobile === process.env.SUPERADMIN_MOBILE &&
    password === process.env.SUPERADMIN_PASSWORD
  ) {
    const token = jwt.sign(
      {
        userId: 0,
        companyId: null,
        role: 'SUPERADMIN',
        isPlatformAdmin: true
      },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    return {
      message: 'Super Admin login successful',
      token,
      user: {
        id: 0,
        name: 'Super Admin',
        role: 'SUPERADMIN',
        companyId: null,
        companyName: 'Platform',
        isPlatformAdmin: true
      }
    };
  }

  /* ================= NORMAL USER LOGIN ================= */
  const userQuery = `
    SELECT 
      u.id,
      u.company_id,
      u.name,
      u.password,
      u.role,
      u.status,
      u.is_platform_admin,
      c.company_name
    FROM users u
    LEFT JOIN companies c ON c.id = u.company_id
    WHERE u.mobile = $1
  `;

  const userResult = await pool.query(userQuery, [mobile]);

  if (userResult.rows.length === 0) {
    throw new Error('User not found');
  }

  const user = userResult.rows[0];

  if (!user.status) {
    throw new Error('User account is inactive');
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    throw new Error('Invalid password');
  }

  const token = jwt.sign(
    {
      userId: user.id,
      companyId: user.company_id,
      role: user.role,
      isPlatformAdmin: user.is_platform_admin
    },
    process.env.JWT_SECRET,
    { expiresIn: '1d' }
  );

  return {
    message: 'Login successful',
    token,
    user: {
      id: user.id,
      name: user.name,
      role: user.role,
      companyId: user.company_id,
      companyName: user.company_name,
      isPlatformAdmin: user.is_platform_admin
    }
  };
};
