import { auth } from 'hatchable';
import data from '../../lib/app-data.js';

export const access = 'public';
export const methods = ['GET'];

export default async function handler(req, res) {
  const user = await auth.requireUser(req, res);
  if (!user) return;
  res.json({
    randomForest: data.models.random_forest.featureImportance,
    logisticRegression: data.models.logistic_regression.topCoefficients,
  });
}
