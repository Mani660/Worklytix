import { db, auth } from 'hatchable';

export const access = 'public';
export const methods = ['GET', 'PUT', 'DELETE'];

export default async function handler(req, res) {
  const user = await auth.requireUser(req, res);
  if (!user) return;

  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid employee id.' });

  if (req.method === 'DELETE') {
    await db.query('DELETE FROM employees WHERE employee_number = $1', [id]);
    return res.json({ ok: true });
  }

  if (req.method === 'PUT') {
    const employee = { ...(req.body || {}), EmployeeNumber: id };
    const { rows } = await db.query(
      `UPDATE employees
       SET attrition = $2, data = $3::jsonb, updated_at = now()
       WHERE employee_number = $1
       RETURNING employee_number, attrition, data`,
      [id, employee.Attrition || 'No', JSON.stringify(employee)]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Employee not found.' });
    return res.json(rows[0]);
  }

  const { rows } = await db.query('SELECT employee_number, attrition, data FROM employees WHERE employee_number = $1', [id]);
  if (!rows[0]) return res.status(404).json({ error: 'Employee not found.' });
  res.json(rows[0]);
}
