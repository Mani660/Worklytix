import fs from 'node:fs';

const required = [
  'public/index.html',
  'public/css/styles.css',
  'public/js/app.js',
  'public/data/app-data.json',
  'hatchable.toml',
  'migrations/001_initial_schema.sql',
  'seed.sql',
];

for (const file of required) {
  if (!fs.existsSync(file)) throw new Error(`Missing ${file}`);
}

const data = JSON.parse(fs.readFileSync('public/data/app-data.json', 'utf8'));
if (data.profile.records !== 1470) throw new Error('Unexpected employee count.');
if (!data.models.logistic_regression.metrics.roc_auc) throw new Error('Missing Logistic Regression metrics.');
if (!data.models.random_forest.metrics.roc_auc) throw new Error('Missing Random Forest metrics.');

console.log('Validation passed.');
