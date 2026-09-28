import data from './app-data.js';

export const artifact = data;

export function transform(input) {
  const prep = data.preprocessor;
  const row = [];
  for (const col of prep.numerical) {
    const stats = prep.numeric_stats[col];
    const value = Number(input[col] ?? stats.median);
    row.push(((Number.isFinite(value) ? value : stats.median) - stats.mean) / stats.std);
  }
  for (const col of prep.categorical) {
    const value = String(input[col] ?? '');
    for (const category of prep.categories[col]) {
      row.push(value === category ? 1 : 0);
    }
  }
  return row;
}

export function sigmoid(value) {
  return 1 / (1 + Math.exp(-Math.max(-35, Math.min(35, value))));
}

export function logisticProbability(input) {
  const row = transform(input);
  const model = data.models.logistic_regression;
  const score = model.coefficients.reduce((sum, weight, index) => sum + weight * row[index], model.intercept);
  return sigmoid(score);
}

export function treeProbability(nodes, row) {
  let index = 0;
  while (nodes[index].feature !== null && nodes[index].feature !== undefined) {
    const node = nodes[index];
    index = row[node.feature] <= node.threshold ? node.left : node.right;
  }
  return nodes[index].prob;
}

export function forestProbability(input) {
  const row = transform(input);
  const trees = data.models.random_forest.trees;
  return trees.reduce((sum, tree) => sum + treeProbability(tree, row), 0) / trees.length;
}

export function riskLevel(probability) {
  const thresholds = data.models.riskThresholds;
  if (probability < thresholds.low) return 'Low';
  if (probability < thresholds.medium) return 'Medium';
  return 'High';
}

export function predictionLabel(probability) {
  return probability >= 0.5 ? 'Potential Attrition Risk' : 'Likely to Stay';
}

export function compareModels(input) {
  const logistic = logisticProbability(input);
  const forest = forestProbability(input);
  return [
    {
      model: 'Logistic Regression',
      key: 'logistic_regression',
      probability: logistic,
      prediction: predictionLabel(logistic),
      riskLevel: riskLevel(logistic),
    },
    {
      model: 'Random Forest',
      key: 'random_forest',
      probability: forest,
      prediction: predictionLabel(forest),
      riskLevel: riskLevel(forest),
    },
  ];
}
