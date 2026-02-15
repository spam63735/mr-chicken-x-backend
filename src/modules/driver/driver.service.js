const pool = require('../../config/db');

/* ======================
   1️⃣ VIEW ASSIGNED TRIPS
====================== */
exports.getAssignedTrips = async (user) => {
  const res = await pool.query(
    `
    SELECT
      t.id,
      t.company_id,

      -- Farm Info
      t.farm_id,
      fa.location AS farm_location,
      fa.latitude AS farm_latitude,
      fa.longitude AS farm_longitude,

      -- Farmer Info
      f.id AS farmer_id,
      f.name AS farmer_name,
      f.mobile AS farmer_mobile,

      -- Driver Info
      t.driver_id,

      -- Lifter Info
      t.lifter_id,

      -- Trip Info
      t.total_birds,
      t.trip_time,
      t.trip_date,
      t.status,
      t.created_at,

      -- Trader / Company Info (FOR QR)
      c.company_name,
      u.upi_id AS trader_upi_id

    FROM trips t

    JOIN farms fa ON fa.id = t.farm_id
    JOIN farmers f ON f.id = fa.farmer_id
    JOIN companies c ON c.id = t.company_id
    JOIN users u ON u.id = c.owner_user_id

    WHERE (t.driver_id = $1 OR t.lifter_id = $1)
      AND t.company_id = $2
      AND t.status IN ('CREATED', 'IN_PROGRESS', 'LIFTED')

    ORDER BY t.trip_date DESC, t.trip_time DESC
    `,
    [user.userId, user.companyId]
  );

  return res.rows;
};


/* ======================
   2️⃣ LIFT TRIP
====================== */
exports.addCageEntry = async (user, tripId, cageNumber, data) => {
  const { color = 'DEFAULT', bird_count, weight } = data;

  if (!bird_count || !weight) {
    throw new Error('Bird count and weight required');
  }

  // 1️⃣ Validate trip
  const tripRes = await pool.query(
    `SELECT * FROM trips WHERE id = $1`,
    [tripId]
  );

  if (!tripRes.rows.length) {
    throw new Error('Trip not found');
  }

  const trip = tripRes.rows[0];

  // 2️⃣ Authorization (Driver OR Lifter)
  if (
    trip.driver_id !== user.userId &&
    trip.lifter_id !== user.userId
  ) {
    throw new Error('Not authorized for this trip');
  }

  // ❌ Only CLOSED trips are locked
  if (trip.status === 'CLOSED') {
    throw new Error('Trip already closed');
  }

  // 3️⃣ Ensure trip_cage exists
  const cageRes = await pool.query(
    `
    INSERT INTO trip_cages (trip_id, cage_number)
    VALUES ($1, $2)
    ON CONFLICT (trip_id, cage_number)
    DO UPDATE SET cage_number = EXCLUDED.cage_number
    RETURNING id
    `,
    [tripId, cageNumber]
  );

  const tripCageId = cageRes.rows[0].id;

  // 4️⃣ Insert / Update cage entry
  await pool.query(
    `
    INSERT INTO trip_cage_entries
      (trip_cage_id, color, bird_count, weight)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (trip_cage_id, color)
    DO UPDATE SET
      bird_count = EXCLUDED.bird_count,
      weight = EXCLUDED.weight
    `,
    [
      tripCageId,
      color,
      Number(bird_count),
      Number(weight),
    ]
  );

  // 5️⃣ 🔥 ALWAYS RECALCULATE TOTALS
  const totalsRes = await pool.query(
    `
    SELECT
      SUM(e.bird_count) AS total_birds,
      SUM(e.weight) AS total_weight
    FROM trip_cages c
    JOIN trip_cage_entries e ON e.trip_cage_id = c.id
    WHERE c.trip_id = $1
    `,
    [tripId]
  );

  const totalBirds = Number(totalsRes.rows[0].total_birds || 0);
  const totalWeight = Number(totalsRes.rows[0].total_weight || 0);

  await pool.query(
    `
    UPDATE trips
    SET
      total_birds = $1,
      total_weight = $2
    WHERE id = $3
    `,
    [totalBirds, totalWeight, tripId]
  );

  // 6️⃣ Move to IN_PROGRESS if first entry
  if (trip.status === 'CREATED') {
    await pool.query(
      `UPDATE trips SET status = 'IN_PROGRESS' WHERE id = $1`,
      [tripId]
    );
  }

  return {
    message: 'Cage entry saved',
    totalBirds,
    totalWeight,
  };
};


exports.resetCage = async (user, tripId, cageNumber) => {
  const cageRes = await pool.query(
    `
    SELECT tc.id
    FROM trip_cages tc
    JOIN trips t ON t.id = tc.trip_id
    WHERE tc.trip_id=$1
      AND tc.cage_number=$2
AND (t.driver_id=$3 OR t.lifter_id=$3)
    `,
    [tripId, cageNumber, user.userId]
  );

  if (!cageRes.rows.length)
    throw new Error('Cage not found');

  const tripCageId = cageRes.rows[0].id;

  await pool.query(
    `DELETE FROM trip_cage_entries WHERE trip_cage_id=$1`,
    [tripCageId]
  );

  return { message: 'Cage reset successfully' };
};

exports.completeTrip = async (user, tripId) => {
  const totalsRes = await pool.query(
    `
    SELECT
      SUM(bird_count) AS total_birds,
      SUM(weight) AS total_weight
    FROM trip_cage_entries e
    JOIN trip_cages c ON c.id = e.trip_cage_id
    JOIN trips t ON t.id = c.trip_id
    WHERE t.id=$1 AND (t.driver_id=$2 OR t.lifter_id=$2)
    `,
    [tripId, user.userId]
  );

  const totals = totalsRes.rows[0];

  await pool.query(
    `
    UPDATE trips
    SET
      total_birds=$1,
      total_weight=$2,
      status='LIFTED'
    WHERE id=$3
    `,
    [totals.total_birds || 0, totals.total_weight || 0, tripId]
  );

  return {
    message: 'Trip lifted successfully',
    totalBirds: totals.total_birds,
    totalWeight: totals.total_weight,
  };
};

  exports.getTripCages = async (user, tripId) => {
    // 1️⃣ Validate trip ownership
    const tripRes = await pool.query(
      `SELECT id FROM trips WHERE id = $1
  AND (driver_id = $2 OR lifter_id = $2)`,
      [tripId, user.userId]
    );

    if (!tripRes.rows.length) {
      throw new Error('Trip not found or not authorized');
    }

    // 2️⃣ Get LIFTED totals per cage + color
    const liftedRes = await pool.query(
      `
      SELECT
        tc.cage_number,
        tce.color,
        SUM(tce.bird_count) AS lifted_birds,
        SUM(tce.weight) AS lifted_weight
      FROM trip_cages tc
      JOIN trip_cage_entries tce ON tce.trip_cage_id = tc.id
      WHERE tc.trip_id = $1
      GROUP BY tc.cage_number, tce.color
      ORDER BY tc.cage_number
      `,
      [tripId]
    );

    // 3️⃣ Get SOLD totals per cage (NO COLOR)
    const soldRes = await pool.query(
      `
      SELECT
        cage_number,
        SUM(bird_count) AS sold_birds,
        SUM(weight) AS sold_weight
      FROM sales
      WHERE trip_id = $1
      GROUP BY cage_number
      `,
      [tripId]
    );

    // 4️⃣ Build SOLD map → cage
    const soldMap = {};
    for (const row of soldRes.rows) {
      soldMap[row.cage_number] = {
        birds: Number(row.sold_birds || 0),
        weight: Number(row.sold_weight || 0),
      };
    }

    // 5️⃣ Build FINAL cageData
const cageData = {};

for (const row of liftedRes.rows) {
  const cageNo = row.cage_number;
  const color = row.color || 'DEFAULT';

  const liftedBirds = Number(row.lifted_birds || 0);
  const liftedWeight = Number(row.lifted_weight || 0);

  const soldBirds = soldMap[cageNo]?.birds || 0;
  const soldWeight = soldMap[cageNo]?.weight || 0;

  const remainingBirds = Math.max(liftedBirds - soldBirds, 0);
  const remainingWeight = Math.max(liftedWeight - soldWeight, 0);

  if (!cageData[cageNo]) cageData[cageNo] = {};

  cageData[cageNo][color] = [
    {
      chickens: remainingBirds,
      weight: Number(remainingWeight.toFixed(2)),
      original_chickens: liftedBirds,
      original_weight: liftedWeight,
    },
  ];
}

  return cageData;
  };

/* ======================
   3️⃣ SELL TO CUSTOMER
====================== */
exports.sellToCustomer = async (user, tripId, data) => {
  const {
    customer_id,
    cage_numbers,
    sell_type,
    bird_count,
    weight,
    rate,
    total_amount,
    payment_mode,
    cash_amount = 0,
    upi_amount = 0,
  } = data;

  // ✅ VALIDATION
  if (
    !customer_id ||
    !Array.isArray(cage_numbers) ||
    cage_numbers.length === 0 ||
    !sell_type ||
    !rate ||
    !payment_mode
  ) {
    throw new Error('Incomplete sale data');
  }

  // ✅ CHECK TRIP
  const tripRes = await pool.query(
    `
    SELECT *
    FROM trips
    WHERE id = $1
      AND driver_id = $2
      AND status = 'LIFTED'
    `,
    [tripId, user.userId]
  );

  if (!tripRes.rows.length) {
    throw new Error('Trip not ready for selling');
  }

  // 🔥 Calculate per cage distribution
    for (const cageNumber of cage_numbers) {

  let birdsToSell;
  let weightToSell;
  let amountToSell;

  if (sell_type === 'FULL') {

    // 🔥 Fetch remaining cage totals
    const cageTotals = await pool.query(
      `
      SELECT
        SUM(e.bird_count) AS birds,
        SUM(e.weight) AS weight
      FROM trip_cages c
      JOIN trip_cage_entries e ON e.trip_cage_id = c.id
      WHERE c.trip_id = $1
        AND c.cage_number = $2
      `,
      [tripId, cageNumber]
    );

    birdsToSell = Number(cageTotals.rows[0].birds || 0);
    weightToSell = Number(cageTotals.rows[0].weight || 0);

    amountToSell = weightToSell * Number(rate);

  } else {
    birdsToSell = Number(bird_count);
    weightToSell = Number(weight);
    amountToSell = Number(total_amount);
  }

  await pool.query(
    `
    INSERT INTO sales (
      trip_id,
      customer_id,
      cage_number,
      sell_type,
      bird_count,
      weight,
      rate,
      total_amount,
      payment_mode,
      cash_amount,
      upi_amount
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    `,
    [
      tripId,
      customer_id,
      cageNumber,
      sell_type,
      birdsToSell,
      weightToSell,
      rate,
      amountToSell,
      payment_mode,
      cash_amount / cage_numbers.length,
      upi_amount / cage_numbers.length,
    ]
  );
}

  // ✅ UPDATE CUSTOMER OUTSTANDING (ONLY ONCE)
  const pendingAmount =
    Number(total_amount) -
    (Number(cash_amount) + Number(upi_amount));

  if (pendingAmount > 0) {
    await pool.query(
      `
      UPDATE customers
      SET outstanding = outstanding + $1
      WHERE id = $2
      `,
      [pendingAmount, customer_id]
    );
  }

  return {
    message: 'Sale recorded successfully',
  };
};




