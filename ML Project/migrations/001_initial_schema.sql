CREATE TABLE employees (
  employee_number BIGINT PRIMARY KEY,
  attrition TEXT NOT NULL CHECK (attrition IN ('Yes', 'No')),
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX employees_attrition_idx ON employees (attrition);
CREATE INDEX employees_data_gin_idx ON employees USING GIN (data);

CREATE TABLE predictions (
  id BIGSERIAL PRIMARY KEY,
  employee_number BIGINT REFERENCES employees(employee_number) ON DELETE SET NULL,
  model TEXT NOT NULL,
  prediction TEXT NOT NULL,
  probability NUMERIC(8, 6) NOT NULL,
  risk_level TEXT NOT NULL,
  input_data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX predictions_created_at_idx ON predictions (created_at DESC);
CREATE INDEX predictions_employee_number_idx ON predictions (employee_number);

CREATE TABLE model_metadata (
  id BIGSERIAL PRIMARY KEY,
  model_name TEXT NOT NULL,
  version TEXT NOT NULL,
  training_date TIMESTAMPTZ NOT NULL,
  dataset_version TEXT NOT NULL,
  metrics JSONB NOT NULL,
  hyperparameters JSONB NOT NULL,
  feature_information JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (model_name, version)
);
