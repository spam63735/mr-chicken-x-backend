const pool = require('../../config/db');
const bcrypt = require('bcrypt');

/* ========= COMMON USER (MANAGER / DRIVER) ========= */
exports.createUser = async (companyId, { name, mobile, password }, role) => {
  if (!name || !mobile || !password) throw new Error('All fields required');

  const exists = await pool.query(
    'SELECT id FROM users WHERE mobile=$1',
    [mobile]
  );
  if (exists.rows.length) throw new Error('Mobile already exists');

  const hash = await bcrypt.hash(password, 10);

  const res = await pool.query(`
    INSERT INTO users (company_id, name, mobile, password, role)
    VALUES ($1,$2,$3,$4,$5)
    RETURNING id,name,mobile
  `, [companyId, name, mobile, hash, role]);

  return { message: `${role} created`, user: res.rows[0] };
};

exports.getUsers = async (companyId, role) => {
  const res = await pool.query(`
    SELECT id,name,mobile,status,created_at
    FROM users
    WHERE company_id=$1 AND role=$2
    ORDER BY created_at DESC
  `, [companyId, role]);
  return res.rows;
};

exports.updateUserStatus = async (companyId, userId, status, role) => {
  if (typeof status !== 'boolean') throw new Error('Invalid status');

  const res = await pool.query(`
    UPDATE users SET status=$1
    WHERE id=$2 AND company_id=$3 AND role=$4
    RETURNING id
  `, [status, userId, companyId, role]);

  if (!res.rows.length) throw new Error(`${role} not found`);
  return { message: `${role} ${status ? 'enabled' : 'disabled'}` };
};

exports.updateUser = async (companyId, userId, data, role) => {
  const { name, mobile } = data;

  if (!name && !mobile) {
    throw new Error('Nothing to update');
  }

  // Mobile uniqueness check (if changed)
  if (mobile) {
    const exists = await pool.query(
      'SELECT id FROM users WHERE mobile=$1 AND id<>$2',
      [mobile, userId]
    );
    if (exists.rows.length) throw new Error('Mobile already exists');
  }

  const res = await pool.query(
    `
    UPDATE users
    SET
      name = COALESCE($1, name),
      mobile = COALESCE($2, mobile)
    WHERE id=$3 AND company_id=$4 AND role=$5
    RETURNING id,name,mobile
    `,
    [name, mobile, userId, companyId, role]
  );

  if (!res.rows.length) {
    throw new Error(`${role} not found`);
  }

  return {
    message: `${role} updated successfully`,
    user: res.rows[0],
  };
};

exports.deleteUser = async (companyId, userId, role) => {
  const res = await pool.query(
    `
    DELETE FROM users
    WHERE id=$1 AND company_id=$2 AND role=$3
    RETURNING id
    `,
    [userId, companyId, role]
  );

  if (!res.rows.length) {
    throw new Error(`${role} not found`);
  }

  return {
    message: `${role} deleted successfully`,
  };
};


/* ========= FARMERS ========= */
exports.createFarmer = async (
  companyId,
  { name, mobile, location, latitude, longitude }
) => {
  const res = await pool.query(
    `
    INSERT INTO farmers (company_id, name, mobile, location, latitude, longitude)
    VALUES ($1,$2,$3,$4,$5,$6)
    RETURNING id, name, mobile, location, latitude, longitude
    `,
    [companyId, name, mobile, location, latitude, longitude]
  );

  return {
    message: 'Farmer added',
    farmer: res.rows[0],
  };
};

exports.getFarmers = async (companyId) => {
  const res = await pool.query(
    'SELECT * FROM farmers WHERE company_id=$1 ORDER BY created_at DESC',
    [companyId]
  );
  return res.rows;
};

exports.updateFarmer = async (companyId, farmerId, data) => {
  const { name, mobile, location, latitude, longitude } = data;

  if (
    name === undefined &&
    mobile === undefined &&
    location === undefined &&
    latitude === undefined &&
    longitude === undefined
  ) {
    throw new Error('Nothing to update');
  }

  const res = await pool.query(
    `
    UPDATE farmers
    SET
      name = COALESCE($1, name),
      mobile = COALESCE($2, mobile),
      location = COALESCE($3, location),
      latitude = COALESCE($4, latitude),
      longitude = COALESCE($5, longitude)
    WHERE id=$6 AND company_id=$7
    RETURNING id, name, mobile, location, latitude, longitude
    `,
    [name, mobile, location, latitude, longitude, farmerId, companyId]
  );

  if (!res.rows.length) {
    throw new Error('Farmer not found');
  }

  return {
    message: 'Farmer updated successfully',
    farmer: res.rows[0],
  };
};

exports.updateFarmerStatus = async (companyId, farmerId, status) => {
  if (typeof status !== 'boolean') {
    throw new Error('Invalid status');
  }

  const res = await pool.query(
    `
    UPDATE farmers
    SET status=$1
    WHERE id=$2 AND company_id=$3
    RETURNING id
    `,
    [status, farmerId, companyId]
  );

  if (!res.rows.length) throw new Error('Farmer not found');

  return {
    message: `Farmer ${status ? 'enabled' : 'disabled'} successfully`,
  };
};

exports.deleteFarmer = async (companyId, farmerId) => {
  const res = await pool.query(
    `
    DELETE FROM farmers
    WHERE id=$1 AND company_id=$2
    RETURNING id
    `,
    [farmerId, companyId]
  );

  if (!res.rows.length) throw new Error('Farmer not found');

  return {
    message: 'Farmer deleted successfully',
  };
};

/* ========= CUSTOMERS ========= */
// helper: safely convert to number
const normalizeNumber = (value, defaultVal = 0) => {
  if (value === '' || value === null || value === undefined) return defaultVal;
  const num = Number(value);
  return Number.isNaN(num) ? defaultVal : num;
};

const generateCustomerCode = async () => {
  const res = await pool.query(
    `SELECT nextval('customer_code_seq') AS seq`
  );
  return `CUST-${String(res.rows[0].seq).padStart(5, '0')}`;
};


exports.createCustomer = async (companyId, data) => {
  const {
    name,
    shop_name,
    mobile,
    alternate_mobile,
    city,
    address,
    customer_type,
    credit_limit,
    credit_days,
    block_on_limit,
    payment_mode,
    upi_number,
    opening_balance,
    has_outstanding,
  } = data;

  if (!name || !mobile) {
    throw new Error('Name and mobile are required');
  }

  const outstanding =
    has_outstanding ? normalizeNumber(opening_balance) : 0;

  // 🔥 generate unique customer code
  const customerCode = await generateCustomerCode();

  const res = await pool.query(
    `
    INSERT INTO customers (
      company_id,
      customer_code,
      name,
      shop_name,
      mobile,
      alternate_mobile,
      city,
      address,
      customer_type,
      credit_limit,
      credit_days,
      block_on_limit,
      payment_mode,
      upi_number,
      outstanding
    )
    VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15
    )
    RETURNING *
    `,
    [
      companyId,
      customerCode,
      name,
      shop_name || null,
      mobile,
      alternate_mobile || null,
      city || null,
      address || null,
      customer_type || 'GREEN',
      normalizeNumber(credit_limit),
      normalizeNumber(credit_days),
      block_on_limit ?? true,
      payment_mode || 'CASH',
      upi_number || null,
      outstanding,
    ]
  );

  return {
    message: 'Customer added successfully',
    customer: res.rows[0],
  };
};


exports.getCustomers = async (companyId) => {
  const res = await pool.query(
    'SELECT * FROM customers WHERE company_id=$1 ORDER BY created_at DESC',
    [companyId]
  );
  return res.rows;
};

exports.updateCustomer = async (companyId, customerId, data) => {
  const {
    name,
    shop_name,
    mobile,
    alternate_mobile,
    city,
    address,
    customer_type,
    credit_limit,
    credit_days,
    block_on_limit,
    payment_mode,
    upi_number,
    has_outstanding,
    opening_balance,
  } = data;

  let outstandingValue = null;
  let updateOutstanding = false;

  if (has_outstanding === true) {
    outstandingValue = Number(opening_balance) || 0;
    updateOutstanding = true;
  }

  if (has_outstanding === false) {
    outstandingValue = 0;
    updateOutstanding = true;
  }

  const res = await pool.query(
    `
    UPDATE customers
    SET
      name = COALESCE($1, name),
      shop_name = COALESCE($2, shop_name),
      mobile = COALESCE($3, mobile),
      alternate_mobile = COALESCE($4, alternate_mobile),
      city = COALESCE($5, city),
      address = COALESCE($6, address),
      customer_type = COALESCE($7, customer_type),
      credit_limit = COALESCE($8, credit_limit),
      credit_days = COALESCE($9, credit_days),
      block_on_limit = COALESCE($10, block_on_limit),
      payment_mode = COALESCE($11, payment_mode),
      upi_number = COALESCE($12, upi_number),
      outstanding = CASE
        WHEN $13 = true THEN $14
        ELSE outstanding
      END
    WHERE id=$15 AND company_id=$16
    RETURNING *
    `,
    [
      name,
      shop_name,
      mobile,
      alternate_mobile,
      city,
      address,
      customer_type,
      credit_limit !== undefined ? Number(credit_limit) : null,
      credit_days !== undefined ? Number(credit_days) : null,
      block_on_limit,
      payment_mode,
      upi_number,
      updateOutstanding,
      outstandingValue,
      customerId,
      companyId,
    ]
  );

  if (!res.rows.length) {
    throw new Error('Customer not found');
  }

  return {
    message: 'Customer updated successfully',
    customer: res.rows[0],
  };
};


exports.deleteCustomer = async (companyId, customerId) => {
  const res = await pool.query(
    `
    DELETE FROM customers
    WHERE id=$1 AND company_id=$2
    RETURNING id
    `,
    [customerId, companyId]
  );

  if (!res.rows.length) throw new Error('Customer not found');

  return {
    message: 'Customer deleted successfully',
  };
};

/**
 * NOTE:
 * Outstanding will later be calculated from SALES table.
 * Keeping this temporarily to avoid breaking existing API.
 */
exports.getCustomerOutstanding = async (companyId, customerId) => {
  const res = await pool.query(`
    SELECT 
      COALESCE(SUM(amount - paid_amount),0) AS outstanding
    FROM sales
    WHERE customer_id=$1
  `, [customerId]);

  return { customerId, outstanding: res.rows[0].outstanding };
};

exports.getAllCustomersOutstanding = async (companyId) => {

  const result = await pool.query(`
    SELECT
      id AS customer_id,
      name,
      mobile,
      outstanding,

      CASE
        WHEN outstanding = 0 THEN 'GREEN'
        WHEN outstanding <= 5000 THEN 'BLUE'
        ELSE 'RED'
      END AS status

    FROM customers
    WHERE company_id = $1
    ORDER BY outstanding DESC
  `, [companyId]);

  return result.rows;
};


/* ========= TRIPS (ORDERS TABLE) ========= */

/**
 * Assign trip: Trader/Manager assigns driver to farmer
 */
exports.createTrip = async (companyId, data) => {
  const {
    farmer_id,
    driver_id,
    total_birds,
    trip_time,
    trip_date,
    contact_name,
    contact_phone,
  } = data;

  if (!farmer_id || !driver_id || !trip_date || !trip_time) {
    throw new Error('Farmer, Driver, Date and Time are required');
  }

  if (contact_phone && contact_phone.length !== 10) {
    throw new Error('Contact phone must be 10 digits');
  }

  const result = await pool.query(
    `
    INSERT INTO trips (
      company_id,
      farmer_id,
      driver_id,
      total_birds,
      trip_time,
      trip_date,
      contact_name,
      contact_phone
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    RETURNING *
    `,
    [
      companyId,
      farmer_id,
      driver_id,
      total_birds,
      trip_time,
      trip_date,
      contact_name || null,
      contact_phone || null,
    ]
  );

  return result.rows[0];
};

exports.getTrips = async (companyId) => {
  const res = await pool.query(`
    SELECT
      t.id,
      t.company_id,

      -- Farmer Info
      t.farmer_id,
      f.name AS farmer_name,
      f.mobile AS farmer_mobile,
      f.location AS farmer_location,

      -- Driver Info
      t.driver_id,
      u.name AS driver_name,
      u.mobile AS driver_mobile,

      -- Trip Details
      t.total_birds,
      t.trip_date,
      t.trip_time,
      t.total_weight,

      -- Contact Person
      t.contact_name,
      t.contact_phone,

      -- Status Info
      t.status,
      t.is_verified,
      t.created_at,
      t.closed_at

    FROM trips t
    LEFT JOIN farmers f ON f.id = t.farmer_id
    LEFT JOIN users u ON u.id = t.driver_id

    WHERE t.company_id = $1

    ORDER BY t.trip_date DESC, t.trip_time DESC
  `, [companyId]);

  return res.rows;
};

exports.updateTrip = async (companyId, tripId, data) => {
  const {
    farmer_id,
    driver_id,
    total_birds,
    trip_date,
    trip_time,
    contact_name,
    contact_phone,
  } = data;

  if (contact_phone && contact_phone.length !== 10) {
    throw new Error('Contact phone must be 10 digits');
  }

  const res = await pool.query(
    `
    UPDATE trips
    SET
      farmer_id = COALESCE($1, farmer_id),
      driver_id = COALESCE($2, driver_id),
      total_birds = COALESCE($3, total_birds),
      trip_date = COALESCE($4, trip_date),
      trip_time = COALESCE($5, trip_time),
      contact_name = COALESCE($6, contact_name),
      contact_phone = COALESCE($7, contact_phone)
    WHERE id = $8
      AND company_id = $9
      AND status != 'CLOSED'
    RETURNING *
    `,
    [
      farmer_id,
      driver_id,
      total_birds,
      trip_date,
      trip_time,
      contact_name || null,
      contact_phone || null,
      tripId,
      companyId,
    ]
  );

  if (!res.rows.length) {
    throw new Error('Trip not found or already closed');
  }

  return {
    message: 'Trip updated successfully',
    trip: res.rows[0],
  };
};

exports.deleteTrip = async (companyId, tripId) => {
  const res = await pool.query(
    `
    DELETE FROM trips
    WHERE id = $1
      AND company_id = $2
      AND status != 'CLOSED'
    RETURNING id
    `,
    [tripId, companyId]
  );

  if (!res.rows.length) {
    throw new Error('Trip not found or already closed');
  }

  return {
    message: 'Trip deleted successfully',
  };
};


/* ========= SALES (MANAGER VIEW) ========= */

exports.getTripSales = async (companyId, tripId) => {
  const res = await pool.query(`
    SELECT
      s.id,
      s.trip_id,
      s.customer_id,
      c.name AS customer_name,
      s.cage_number,
      s.sell_type,
      s.bird_count,
      s.weight,
      s.rate,
      s.total_amount,
      s.payment_mode,
      COALESCE(s.cash_amount, 0) AS cash_amount,
      COALESCE(s.upi_amount, 0) AS upi_amount,
      s.created_at
    FROM sales s
    JOIN customers c ON c.id = s.customer_id
    JOIN trips t ON t.id = s.trip_id
    WHERE s.trip_id = $1
      AND t.company_id = $2
    ORDER BY s.cage_number, s.created_at ASC
  `, [tripId, companyId]);

  return res.rows;
};


/* ========= DAY CLOSE ========= */

exports.closeDay = async (
  companyId,
  tripId,
  { diesel_expense = 0, other_expense = 0 }
) => {
  // 1️⃣ Check trip exists
  const tripRes = await pool.query(`
    SELECT status
    FROM trips
    WHERE id = $1
      AND company_id = $2
  `, [tripId, companyId]);

  if (!tripRes.rows.length) {
    throw new Error('Trip not found');
  }

  const tripStatus = tripRes.rows[0].status;

  if (tripStatus === 'CLOSED') {
    throw new Error('Trip already closed');
  }

  if (tripStatus !== 'LIFTED') {
    throw new Error('Trip is not ready to close');
  }

  // 2️⃣ Save expenses (trip-based)
  await pool.query(`
    INSERT INTO expenses (
      trip_id,
      diesel_expense,
      other_expense,
      created_at
    )
    VALUES ($1, $2, $3, NOW())
  `, [tripId, diesel_expense, other_expense]);

  // 3️⃣ Close trip
  await pool.query(`
    UPDATE trips
    SET status = 'CLOSED',
        closed_at = NOW()
    WHERE id = $1
  `, [tripId]);

  return { message: 'Day closed successfully' };
};
  
/* ========= DASHBOARD ========= */
exports.getDashboard = async (companyId) => {
  const [
    countsResult,
    weeklySalesResult,
    paymentSplitResult,
    tripStatusResult,
  ] = await Promise.all([
    // ===================== SUMMARY COUNTS =====================
    pool.query(`
      SELECT
        (SELECT COUNT(*) FROM users WHERE company_id = $1 AND role = 'DRIVER') AS total_drivers,
        (SELECT COUNT(*) FROM farmers WHERE company_id = $1) AS total_farmers,
        (SELECT COUNT(*) FROM customers WHERE company_id = $1) AS total_customers,
        (SELECT COUNT(*) FROM trips WHERE company_id = $1 AND status != 'CLOSED') AS active_trips
    `, [companyId]),

    // ===================== WEEKLY SALES =====================
    pool.query(`
      SELECT
        DATE(s.created_at) AS sale_date,
        SUM(s.total_amount) AS total_sales,
        SUM(COALESCE(s.cash_amount, 0) + COALESCE(s.upi_amount, 0)) AS total_collected
      FROM sales s
      JOIN trips t ON t.id = s.trip_id
      WHERE t.company_id = $1
        AND s.created_at >= CURRENT_DATE - INTERVAL '7 days'
      GROUP BY DATE(s.created_at)
      ORDER BY sale_date
    `, [companyId]),

    // ===================== PAYMENT SPLIT =====================
    pool.query(`
      SELECT 'CASH' AS payment_mode,
             SUM(COALESCE(s.cash_amount, 0)) AS total_amount
      FROM sales s
      JOIN trips t ON t.id = s.trip_id
      WHERE t.company_id = $1

      UNION ALL

      SELECT 'UPI' AS payment_mode,
             SUM(COALESCE(s.upi_amount, 0)) AS total_amount
      FROM sales s
      JOIN trips t ON t.id = s.trip_id
      WHERE t.company_id = $1
    `, [companyId]),

    // ===================== TRIP STATUS =====================
    pool.query(`
      SELECT
        status,
        COUNT(*) AS count
      FROM trips
      WHERE company_id = $1
      GROUP BY status
    `, [companyId])
  ]);

  return {
    summary: countsResult.rows[0],
    weeklySales: weeklySalesResult.rows,
    paymentSplit: paymentSplitResult.rows,
    tripStatus: tripStatusResult.rows
  };
};


exports.creditCustomer = async (companyId, customerId, amount) => {

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 🔒 Lock row
    const customerRes = await client.query(
      `
      SELECT outstanding 
      FROM customers 
      WHERE id = $1 AND company_id = $2
      FOR UPDATE
      `,
      [customerId, companyId]
    );

    if (customerRes.rows.length === 0) {
      throw new Error('Customer not found');
    }

    const currentOutstanding = Number(customerRes.rows[0].outstanding);

    if (amount > currentOutstanding) {
      throw new Error('Credit amount cannot exceed outstanding');
    }

    const newOutstanding = currentOutstanding - amount;

    // ✅ Update outstanding
    const updateRes = await client.query(
      `
      UPDATE customers
      SET outstanding = $1
      WHERE id = $2
      RETURNING id, name, outstanding
      `,
      [newOutstanding, customerId]
    );

    await client.query('COMMIT');

    return {
      message: 'Credit applied successfully',
      customer: updateRes.rows[0],
    };

  } catch (error) {

    await client.query('ROLLBACK');
    throw error;

  } finally {
    client.release();
  }
};


exports.getSalesReport = async (companyId, filters) => {
  const {
    startDate,
    endDate,
    customerId,
    farmerId,
    driverId,
    groupBy,
  } = filters;

  let groupSelect = '';
  let groupBySQL = '';
  let orderBy = '';

  switch (groupBy) {

    // ================= DATE WISE =================
    case 'DATE':
      groupSelect = `
        s.created_at::date AS group_key
      `;
      groupBySQL = `
        GROUP BY s.created_at::date
      `;
      orderBy = `group_key DESC`;
      break;

    // ================= CUSTOMER WISE =================
    case 'CUSTOMER':
      groupSelect = `
        c.id AS group_id,
        c.name AS group_key
      `;
      groupBySQL = `
        GROUP BY c.id, c.name
      `;
      orderBy = `group_key ASC`;
      break;

    // ================= FARMER WISE =================
    case 'FARMER':
      groupSelect = `
        f.id AS group_id,
        f.name AS group_key
      `;
      groupBySQL = `
        GROUP BY f.id, f.name
      `;
      orderBy = `group_key ASC`;
      break;

    // ================= DRIVER WISE =================
    case 'DRIVER':
      groupSelect = `
        u.id AS group_id,
        u.name AS group_key
      `;
      groupBySQL = `
        GROUP BY u.id, u.name
      `;
      orderBy = `group_key ASC`;
      break;

    // ================= OVERALL SUMMARY =================
    default:
      groupSelect = `
        'ALL' AS group_key
      `;
      groupBySQL = '';
      orderBy = '';
      break;
  }

  const query = `
    SELECT

      ${groupSelect},

      COUNT(s.id) AS total_transactions,

      COALESCE(SUM(s.total_amount),0) AS total_sales,

      COALESCE(SUM(s.cash_amount),0) AS cash_received,

      COALESCE(SUM(s.upi_amount),0) AS upi_received,

      COALESCE(
        SUM(s.total_amount)
        -
        SUM(COALESCE(s.cash_amount,0) + COALESCE(s.upi_amount,0)),
        0
      ) AS pending_amount

    FROM sales s

    JOIN trips t ON t.id = s.trip_id
    JOIN customers c ON c.id = s.customer_id
    JOIN farmers f ON f.id = t.farmer_id
    JOIN users u ON u.id = t.driver_id

    WHERE t.company_id = $1

      AND ($2::date IS NULL OR s.created_at::date >= $2)
      AND ($3::date IS NULL OR s.created_at::date <= $3)
      AND ($4::int IS NULL OR s.customer_id = $4)
      AND ($5::int IS NULL OR t.farmer_id = $5)
      AND ($6::int IS NULL OR t.driver_id = $6)

    ${groupBySQL}

    ${orderBy ? `ORDER BY ${orderBy}` : ''}
  `;

  const res = await pool.query(query, [
    companyId,
    startDate || null,
    endDate || null,
    customerId || null,
    farmerId || null,
    driverId || null,
  ]);

  // ================= GRAND TOTAL SUMMARY =================

  const summary = res.rows.reduce(
    (acc, row) => {
      acc.total_sales += Number(row.total_sales || 0);
      acc.cash_received += Number(row.cash_received || 0);
      acc.upi_received += Number(row.upi_received || 0);
      acc.pending += Number(row.pending_amount || 0);
      acc.total_transactions += Number(row.total_transactions || 0);
      return acc;
    },
    {
      total_sales: 0,
      cash_received: 0,
      upi_received: 0,
      pending: 0,
      total_transactions: 0,
    }
  );

  return {
    filters,
    summary,
    rows: res.rows,
  };
};


exports.getTripReport = async (companyId, filters) => {

  const {
    startDate,
    endDate,
    farmerId,
    driverId,
  } = filters;

  const result = await pool.query(
    `
    SELECT
      t.id AS trip_id,
      t.trip_date,
      t.total_birds,

      f.name AS farmer_name,
      u.name AS driver_name,

      COALESCE(SUM(s.total_amount),0) AS total_sales,
      COALESCE(SUM(s.cash_amount),0) AS cash_received,
      COALESCE(SUM(s.upi_amount),0) AS upi_received,

      COALESCE(
        SUM(s.total_amount) -
        SUM(COALESCE(s.cash_amount,0) + COALESCE(s.upi_amount,0)),
        0
      ) AS pending_amount

    FROM trips t

    LEFT JOIN farmers f ON f.id = t.farmer_id
    LEFT JOIN users u ON u.id = t.driver_id
    LEFT JOIN sales s ON s.trip_id = t.id

    WHERE t.company_id = $1

      AND ($2::date IS NULL OR t.trip_date >= $2)
      AND ($3::date IS NULL OR t.trip_date <= $3)

      AND ($4::int IS NULL OR t.farmer_id = $4)
      AND ($5::int IS NULL OR t.driver_id = $5)

    GROUP BY
      t.id,
      t.trip_date,
      t.total_birds,
      f.name,
      u.name

    ORDER BY t.trip_date DESC
    `,
    [
      companyId,
      startDate,
      endDate,
      farmerId,
      driverId,
    ]
  );

  return result.rows;
};

// =======================================================
// 2️⃣ SINGLE TRIP SALES DETAILS (EXPAND VIEW)
// =======================================================

exports.getTripSalesDetails = async (tripId) => {

  const result = await pool.query(
    `
    SELECT
      s.id,
      s.created_at::date AS sale_date,

      c.name AS customer_name,

      s.cage_number,
      s.sell_type,

      s.bird_count,
      s.weight,
      s.rate,

      s.total_amount,
      s.cash_amount,
      s.upi_amount,

      (
        s.total_amount -
        (COALESCE(s.cash_amount,0) + COALESCE(s.upi_amount,0))
      ) AS pending

    FROM sales s
    JOIN customers c ON c.id = s.customer_id

    WHERE s.trip_id = $1

    ORDER BY s.created_at DESC
    `,
    [tripId]
  );

  return result.rows;
};

// =======================================================
// 3️⃣ CUSTOMER LEDGER REPORT
// =======================================================

exports.getCustomerLedger = async (companyId, filters) => {

  const { customerId, startDate, endDate } = filters;

  const result = await pool.query(
    `
    SELECT
      s.id,
      s.created_at::date AS sale_date,

      t.id AS trip_id,

      f.name AS farmer_name,
      u.name AS driver_name,

      s.total_amount,
      s.cash_amount,
      s.upi_amount,

      (
        s.total_amount -
        (COALESCE(s.cash_amount,0) + COALESCE(s.upi_amount,0))
      ) AS pending

    FROM sales s

    JOIN trips t ON t.id = s.trip_id
    JOIN farmers f ON f.id = t.farmer_id
    JOIN users u ON u.id = t.driver_id

    WHERE t.company_id = $1
      AND s.customer_id = $2

      AND ($3::date IS NULL OR s.created_at::date >= $3)
      AND ($4::date IS NULL OR s.created_at::date <= $4)

    ORDER BY s.created_at DESC
    `,
    [
      companyId,
      customerId,
      startDate,
      endDate,
    ]
  );

  return result.rows;
};


