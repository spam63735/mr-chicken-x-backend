const pool = require('../../config/db');
const bcrypt = require('bcrypt');

/* =========================
   CREATE TRADER
========================= */
exports.createTrader = async ({
  companyName,
  ownerName,
  mobile,
  password,
  upi_id,
}) => {

  if (!companyName || !ownerName || !mobile || !password) {
    throw new Error('All fields are required');
  }

  const cleanUpi = upi_id?.trim() || null;

  // Validate UPI format
  if (cleanUpi && !/^[\w.\-]{2,256}@[\w]{2,64}$/.test(cleanUpi)) {
    throw new Error('Invalid UPI ID format');
  }

  // Check mobile uniqueness
  const existing = await pool.query(
    'SELECT id FROM users WHERE mobile = $1',
    [mobile]
  );

  if (existing.rows.length > 0) {
    throw new Error('Mobile already registered');
  }

  // Check UPI uniqueness
  if (cleanUpi) {
    const upiCheck = await pool.query(
      'SELECT id FROM users WHERE upi_id = $1',
      [cleanUpi]
    );

    if (upiCheck.rows.length > 0) {
      throw new Error('UPI ID already registered');
    }
  }

  // Create company
  const companyRes = await pool.query(
    'INSERT INTO companies (company_name) VALUES ($1) RETURNING id',
    [companyName]
  );

  const companyId = companyRes.rows[0].id;

  // Hash password
  const hashedPassword = await bcrypt.hash(password, 10);

  // Create trader user
  const userRes = await pool.query(
    `
    INSERT INTO users (
      company_id,
      name,
      mobile,
      password,
      role,
      upi_id
    )
    VALUES ($1, $2, $3, $4, 'TRADER', $5)
    RETURNING id, upi_id
    `,
    [
      companyId,
      ownerName,
      mobile,
      hashedPassword,
      cleanUpi,
    ]
  );

  const userId = userRes.rows[0].id;

  // Link company owner
  await pool.query(
    'UPDATE companies SET owner_user_id = $1 WHERE id = $2',
    [userId, companyId]
  );

  return {
    message: 'Trader created successfully',
    companyId,
    traderUserId: userId,
    upi_id: userRes.rows[0].upi_id, // 👈 confirm saved
  };
};



/* =========================
   LIST TRADERS
========================= */
exports.getTraders = async () => {
  const result = await pool.query(`
    SELECT
      u.id AS id,                 -- ✅ TRADER USER ID (REQUIRED FOR UPDATE)
      c.id AS company_id,

      c.company_name,
      c.subscription_status,

      u.name AS owner_name,
      u.mobile,
      u.upi_id,                   -- ✅ NEW FIELD

      c.created_at

    FROM companies c
    LEFT JOIN users u ON u.id = c.owner_user_id

    ORDER BY c.created_at DESC
  `);

  return result.rows;
};


/* =========================
   VIEW TRADER DETAILS
========================= */
exports.getTraderById = async (companyId) => {
  const result = await pool.query(
    `
    SELECT
      c.id AS company_id,
      c.company_name,
      c.subscription_status,
      c.created_at,
      u.name AS owner_name,
      u.mobile
    FROM companies c
    LEFT JOIN users u ON u.id = c.owner_user_id
    WHERE c.id = $1
    `,
    [companyId]
  );

  if (result.rows.length === 0) {
    throw new Error('Trader not found');
  }

  return result.rows[0];
};

/* =========================
   EDIT TRADER INFO
========================= */
exports.updateTrader = async (companyId, data) => {

  const {
    companyName,
    ownerName,
    mobile,
    upi_id,
  } = data;

  // ---------------------------
  // Update company name

  if (companyName) {
    await pool.query(
      'UPDATE companies SET company_name = $1 WHERE id = $2',
      [companyName, companyId]
    );
  }

  // ---------------------------
  // Update trader user fields

  if (ownerName || mobile || upi_id) {

    const updates = [];
    const values = [];
    let index = 1;

    if (ownerName) {
      updates.push(`name = $${index++}`);
      values.push(ownerName);
    }

    if (mobile) {
      updates.push(`mobile = $${index++}`);
      values.push(mobile);
    }

    if (upi_id) {
      updates.push(`upi_id = $${index++}`);
      values.push(upi_id);
    }

    // companyId for subquery
    values.push(companyId);

    await pool.query(
      `
      UPDATE users
      SET ${updates.join(', ')}
      WHERE id = (
        SELECT owner_user_id
        FROM companies
        WHERE id = $${index}
      )
      `,
      values
    );
  }

  return { message: 'Trader updated successfully' };
};


/* =========================
   ENABLE / DISABLE TRADER
========================= */
exports.updateTraderStatus = async (traderId, status) => {
  if (typeof status !== 'boolean') {
    throw new Error('Status must be true or false');
  }

  const result = await pool.query(
    `
    UPDATE companies c
    SET subscription_status = $1
    FROM users u
    WHERE u.company_id = c.id
      AND u.id = $2
    `,
    [status, traderId]
  );

  if (result.rowCount === 0) {
    throw new Error('Trader not found');
  }

  return {
    message: `Trader ${status ? 'enabled' : 'disabled'} successfully`,
  };
};


/* =========================
   PLATFORM DASHBOARD
========================= */
exports.getPlatformDashboard = async () => {
  const result = await pool.query(`
    SELECT
      COUNT(*) AS total_traders,
      COUNT(*) FILTER (WHERE subscription_status = true) AS active_traders,
      COUNT(*) FILTER (WHERE subscription_status = false) AS inactive_traders
    FROM companies
  `);

  return result.rows[0];
};


exports.deleteTrader = async (traderId) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1️⃣ Find company linked to trader
    const companyRes = await client.query(
      'SELECT company_id FROM users WHERE id = $1',
      [traderId]
    );

    let companyId = null;

    if (companyRes.rowCount > 0) {
      companyId = companyRes.rows[0].company_id;

      // 2️⃣ Delete trader
      await client.query(
        'DELETE FROM users WHERE id = $1',
        [traderId]
      );
    }

    // 3️⃣ Delete company (even if user missing but company exists)
    if (companyId) {
      await client.query(
        'DELETE FROM companies WHERE id = $1',
        [companyId]
      );
    }

    await client.query('COMMIT');

    return {
      message: 'Trader and company deleted successfully',
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};


