# Worklytix

Worklytix is an employee attrition prediction and workforce analytics platform for the B.Tech project **Employee Attrition Prediction using Logistic Regression and Random Forest**.

The application uses `ML_Project_Data.xlsx` as the source of truth. It does not fabricate employee rows, dashboard statistics, model metrics, predictions, or analytics.

## Dataset

- Source file: `ML_Project_Data.xlsx`
- Sheet: `WA_Fn-UseC_-HR-Employee-Attriti`
- Records: 1,470
- Columns: 35
- Target column: `Attrition`
- Target distribution: 237 `Yes`, 1,233 `No`
- Missing values: 0
- Duplicate records: 0

Fields excluded from model training:

- `Attrition`: target label
- `EmployeeNumber`: identifier
- `EmployeeCount`, `Over18`, `StandardHours`: constant columns

## Features

- HR dashboard with dataset-derived KPIs
- Dynamic filters for department, job role, gender, overtime, and related fields
- Employee table with search, filtering, pagination, and details
- Attrition prediction form built from actual workbook features
- Logistic Regression and Random Forest model comparison
- Risk levels using explicit thresholds:
  - Low: `< 30%`
  - Medium: `30% to < 60%`
  - High: `>= 60%`
- Model performance page with actual generated metrics
- Explainability page with Random Forest feature importance and Logistic Regression coefficients
- Prediction history stored locally in the browser for the static preview
- Hatchable-style API, migration, seed, and auth configuration files

## Machine Learning Methodology

The reproducible generator is in `tools/generate_app_data.py`.

Pipeline:

1. Load Excel dataset
2. Inspect schema, missing values, duplicates, and target distribution
3. Exclude target, identifier, constant fields, and leakage-prone fields
4. Detect numeric and categorical features
5. Standardize numeric fields
6. One-hot encode categorical fields
7. Use a stratified train/test split
8. Train Logistic Regression with balanced class weighting
9. Train Random Forest with bootstrap decision trees
10. Calculate accuracy, precision, recall, F1, ROC-AUC, confusion matrix, ROC points, precision-recall points, and cross-validation summaries
11. Export model parameters, trees, metrics, analytics, and records to `public/data/app-data.json`

`scikit-learn` was not available in the bundled runtime, so the project includes a NumPy/Pandas implementation instead of fabricated model output.

## Architecture

```text
public/
  index.html
  css/styles.css
  js/app.js
  data/app-data.json
api/
  analytics/overview.js
  employees.js
  employees/[id].js
  models/performance.js
  models/feature-importance.js
  predictions.js
lib/
  app-data.js
  ml.js
migrations/
  001_initial_schema.sql
tools/
  generate_app_data.py
  local-server.mjs
  validate.mjs
hatchable.toml
seed.sql
```

Hatchable notes:

- `hatchable.toml` enables Hatchable-hosted email authentication.
- API files declare `export const access = 'public'` and use `auth.requireUser(req, res)` for app-user gating.
- `migrations/001_initial_schema.sql` defines `employees`, `predictions`, and `model_metadata`.
- `seed.sql` upserts the actual workbook employees by `EmployeeNumber`.

## Running Locally

Use the bundled Node runtime or any modern Node installation:

```bash
npm run start
```

The local preview server serves the SPA and prints the selected URL. In this workspace it is running at:

```text
http://127.0.0.1:5173
```

## Regenerating Data and Models

After changing `ML_Project_Data.xlsx`, regenerate the data artifact and seed file:

```bash
npm run generate:data
```

Then validate required files and generated metrics:

```bash
npm run validate
```

## Limitations

- The local preview is a static SPA. It uses `localStorage` for prediction history.
- On Hatchable, the provided API routes and database schema are intended to back persistent employee and prediction workflows.
- Model output is probabilistic and should support HR analysis, not automated employment decisions.
- Historical HR data can contain bias. Feature importance and coefficients show model associations, not causation.

## Future Scope

- Add Hatchable deployment dry-run once connected to a Hatchable project.
- Add import status UI for uploading revised Excel datasets.
- Persist model metadata rows during deployment.
- Add SHAP-style explanations if the runtime supports the required calculation efficiently.
- Add role-based admin screens for controlled employee data updates.
