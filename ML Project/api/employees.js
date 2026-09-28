import { db, auth } from 'hatchable';

export const access = 'public';
export const methods = ['GET', 'POST'];

export default async function handler(req, res) {
  const user = await auth.requireUser(req, res);
  if (!user) return;

  if (req.method === 'POST') {
    const employee = req.body || {};
    if (!employee.EmployeeNumber) return res.status(400).json({ error: 'EmployeeNumber is required.' });
    const { rows } = await db.query(
      `INSERT INTO employees (employee_number, attrition, data)
       VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (employee_number)
       DO UPDATE SET attrition = EXCLUDED.attrition, data = EXCLUDED.data, updated_at = now()
       RETURNING employee_number, attrition, data`,
      [Number(employee.EmployeeNumber), employee.Attrition || 'No', JSON.stringify(employee)]
    );
    return res.json(rows[0]);
  }

  const limit = Math.min(Number(req.query.limit || 25), 100);
  const offset = Math.max(Number(req.query.offset || 0), 0);
  const search = `%${String(req.query.search || '').toLowerCase()}%`;
  const { rows } = await db.query(
    `SELECT employee_number, attrition, data
     FROM employees
     WHERE lower(data::text) LIKE $1
     ORDER BY employee_number
     LIMIT $2 OFFSET $3`,
    [search, limit, offset]
  );
  const count = await db.query('SELECT count(*)::int AS total FROM employees WHERE lower(data::text) LIKE $1', [search]);
  res.json({ rows, total: count.rows[0].total, limit, offset });
}
