import { db, auth } from 'hatchable';
import { compareModels, predictionLabel, riskLevel } from '../lib/ml.js';

export const access = 'public';
export const methods = ['GET', 'POST'];

export default async function handler(req, res) {
  const user = await auth.requireUser(req, res);
  if (!user) return;

  if (req.method === 'POST') {
    const input = req.body?.input || req.body || {};
    const comparison = compareModels(input);
    const production = comparison.find((item) => item.key === 'random_forest');
    const { rows } = await db.query(
      `INSERT INTO predictions (employee_number, model, prediction, probability, risk_level, input_data)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)
       RETURNING *`,
      [
        input.EmployeeNumber ? Number(input.EmployeeNumber) : null,
        production.model,
        predictionLabel(production.probability),
        production.probability,
        riskLevel(production.probability),
        JSON.stringify(input),
      ]
    );
    return res.json({ saved: rows[0], comparison });
  }

  const { rows } = await db.query('SELECT * FROM predictions ORDER BY created_at DESC LIMIT 100');
  res.json(rows);
}
