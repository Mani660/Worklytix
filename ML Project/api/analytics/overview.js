import { db, auth } from 'hatchable';

export const access = 'public';
export const methods = ['GET'];

export default async function handler(req, res) {
  const user = await auth.requireUser(req, res);
  if (!user) return;

  const { rows } = await db.query(`
    SELECT
      count(*)::int AS total_employees,
      count(*) FILTER (WHERE attrition = 'Yes')::int AS attrition_yes,
      count(*) FILTER (WHERE attrition = 'No')::int AS attrition_no,
      avg((data->>'Age')::numeric)::float AS average_age,
      avg((data->>'MonthlyIncome')::numeric)::float AS average_monthly_income,
      avg((data->>'YearsAtCompany')::numeric)::float AS average_years_at_company,
      avg((data->>'JobSatisfaction')::numeric)::float AS average_job_satisfaction
    FROM employees
  `);
  const row = rows[0];
  res.json({ ...row, attrition_rate: row.total_employees ? row.attrition_yes / row.total_employees : 0 });
}
