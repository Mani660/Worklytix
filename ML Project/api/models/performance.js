import { auth } from 'hatchable';
import data from '../../lib/app-data.js';

export const access = 'public';
export const methods = ['GET'];

export default async function handler(req, res) {
  const user = await auth.requireUser(req, res);
  if (!user) return;
  res.json({
    defaultModel: data.models.defaultModel,
    riskThresholds: data.models.riskThresholds,
    logistic_regression: data.models.logistic_regression,
    random_forest: {
      ...data.models.random_forest,
      trees: undefined,
    },
  });
}
