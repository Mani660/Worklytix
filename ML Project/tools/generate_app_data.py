import json
import math
import random
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
from pandas.api.types import is_numeric_dtype


ROOT = Path(__file__).resolve().parents[1]
DATASET = ROOT / "ML_Project_Data.xlsx"
OUT_DIR = ROOT / "public" / "data"
OUT_DIR.mkdir(parents=True, exist_ok=True)
LIB_DIR = ROOT / "lib"
LIB_DIR.mkdir(parents=True, exist_ok=True)

SEED = 42
random.seed(SEED)
np.random.seed(SEED)


def sigmoid(z):
    z = np.clip(z, -35, 35)
    return 1.0 / (1.0 + np.exp(-z))


def metrics(y_true, proba, threshold=0.5):
    y_true = np.asarray(y_true).astype(int)
    proba = np.asarray(proba, dtype=float)
    pred = (proba >= threshold).astype(int)
    tp = int(((pred == 1) & (y_true == 1)).sum())
    tn = int(((pred == 0) & (y_true == 0)).sum())
    fp = int(((pred == 1) & (y_true == 0)).sum())
    fn = int(((pred == 0) & (y_true == 1)).sum())
    accuracy = (tp + tn) / max(len(y_true), 1)
    precision = tp / max(tp + fp, 1)
    recall = tp / max(tp + fn, 1)
    f1 = 2 * precision * recall / max(precision + recall, 1e-12)
    return {
        "accuracy": accuracy,
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "roc_auc": roc_auc(y_true, proba),
        "confusion_matrix": {"tn": tn, "fp": fp, "fn": fn, "tp": tp},
    }


def roc_auc(y_true, scores):
    pairs = sorted(zip(scores, y_true), key=lambda x: x[0])
    n_pos = sum(y_true)
    n_neg = len(y_true) - n_pos
    if n_pos == 0 or n_neg == 0:
        return 0.5
    rank_sum = 0.0
    i = 0
    while i < len(pairs):
        j = i
        while j + 1 < len(pairs) and pairs[j + 1][0] == pairs[i][0]:
            j += 1
        avg_rank = (i + j + 2) / 2.0
        rank_sum += avg_rank * sum(label for _, label in pairs[i : j + 1])
        i = j + 1
    return (rank_sum - n_pos * (n_pos + 1) / 2) / (n_pos * n_neg)


def pr_curve(y_true, scores):
    thresholds = np.linspace(0, 1, 21)
    return [
        {"threshold": float(t), **{k: v for k, v in metrics(y_true, scores, t).items() if k in ("precision", "recall")}}
        for t in thresholds
    ]


def roc_curve(y_true, scores):
    out = []
    y_true = np.asarray(y_true).astype(int)
    for t in np.linspace(0, 1, 31):
        pred = (scores >= t).astype(int)
        tp = ((pred == 1) & (y_true == 1)).sum()
        tn = ((pred == 0) & (y_true == 0)).sum()
        fp = ((pred == 1) & (y_true == 0)).sum()
        fn = ((pred == 0) & (y_true == 1)).sum()
        out.append(
            {
                "threshold": float(t),
                "tpr": float(tp / max(tp + fn, 1)),
                "fpr": float(fp / max(fp + tn, 1)),
            }
        )
    return out


def stratified_split(y, test_size=0.2):
    train, test = [], []
    for cls in sorted(set(y)):
        idx = [i for i, v in enumerate(y) if v == cls]
        random.shuffle(idx)
        cut = int(round(len(idx) * test_size))
        test.extend(idx[:cut])
        train.extend(idx[cut:])
    random.shuffle(train)
    random.shuffle(test)
    return np.array(train), np.array(test)


def build_preprocessor(df, features, categorical, numerical):
    prep = {
        "features": features,
        "categorical": categorical,
        "numerical": numerical,
        "numeric_stats": {},
        "categories": {},
        "encoded_features": [],
    }
    for col in numerical:
        series = pd.to_numeric(df[col], errors="coerce")
        mean = float(series.mean())
        std = float(series.std(ddof=0)) or 1.0
        prep["numeric_stats"][col] = {"mean": mean, "std": std, "median": float(series.median())}
        prep["encoded_features"].append(col)
    for col in categorical:
        cats = sorted(str(x) for x in df[col].dropna().unique())
        prep["categories"][col] = cats
        for cat in cats:
            prep["encoded_features"].append(f"{col}={cat}")
    return prep


def transform(df, prep):
    cols = []
    for col in prep["numerical"]:
        stats = prep["numeric_stats"][col]
        values = pd.to_numeric(df[col], errors="coerce").fillna(stats["median"]).to_numpy(dtype=float)
        cols.append((values - stats["mean"]) / stats["std"])
    for col in prep["categorical"]:
        raw = df[col].astype(str).fillna("").to_numpy()
        for cat in prep["categories"][col]:
            cols.append((raw == cat).astype(float))
    return np.vstack(cols).T


def train_logistic(X, y, l2=0.03, lr=0.08, steps=1600):
    n, d = X.shape
    w = np.zeros(d)
    b = 0.0
    pos_weight = (len(y) - y.sum()) / max(y.sum(), 1)
    weights = np.where(y == 1, pos_weight, 1.0)
    for _ in range(steps):
        p = sigmoid(X @ w + b)
        err = (p - y) * weights
        w -= lr * ((X.T @ err) / n + l2 * w)
        b -= lr * err.mean()
    return w, b


class Tree:
    def __init__(self, max_depth=6, min_leaf=12, mtry=None):
        self.max_depth = max_depth
        self.min_leaf = min_leaf
        self.mtry = mtry
        self.nodes = []
        self.importance = Counter()

    def fit(self, X, y):
        self.nodes = []
        self._build(X, y, np.arange(len(y)), 0)
        return self

    def _gini(self, y):
        if len(y) == 0:
            return 0.0
        p = y.mean()
        return 1 - p * p - (1 - p) * (1 - p)

    def _build(self, X, y, idx, depth):
        node_id = len(self.nodes)
        prob = float(y[idx].mean()) if len(idx) else 0.0
        self.nodes.append({"prob": prob, "feature": None, "threshold": None, "left": None, "right": None})
        if depth >= self.max_depth or len(idx) < self.min_leaf * 2 or len(set(y[idx])) == 1:
            return node_id
        d = X.shape[1]
        candidates = np.random.choice(d, size=min(self.mtry or int(math.sqrt(d)) + 1, d), replace=False)
        parent = self._gini(y[idx])
        best = None
        for f in candidates:
            vals = X[idx, f]
            uniq = np.unique(vals)
            if len(uniq) <= 1:
                continue
            if len(uniq) > 12:
                qs = np.percentile(vals, [10, 20, 30, 40, 50, 60, 70, 80, 90])
                thresholds = np.unique(qs)
            else:
                thresholds = (uniq[:-1] + uniq[1:]) / 2
            for t in thresholds:
                left = idx[vals <= t]
                right = idx[vals > t]
                if len(left) < self.min_leaf or len(right) < self.min_leaf:
                    continue
                gain = parent - (len(left) / len(idx)) * self._gini(y[left]) - (len(right) / len(idx)) * self._gini(y[right])
                if best is None or gain > best[0]:
                    best = (gain, f, float(t), left, right)
        if not best or best[0] <= 1e-8:
            return node_id
        gain, f, t, left, right = best
        self.importance[f] += gain * len(idx)
        self.nodes[node_id].update(
            {"feature": int(f), "threshold": float(t), "left": self._build(X, y, left, depth + 1), "right": self._build(X, y, right, depth + 1)}
        )
        return node_id

    def predict_proba(self, X):
        out = np.zeros(X.shape[0])
        for i, row in enumerate(X):
            n = 0
            while self.nodes[n]["feature"] is not None:
                node = self.nodes[n]
                n = node["left"] if row[node["feature"]] <= node["threshold"] else node["right"]
            out[i] = self.nodes[n]["prob"]
        return out


def train_forest(X, y, n_trees=80, max_depth=7, min_leaf=10):
    trees = []
    for _ in range(n_trees):
        idx = np.random.choice(len(y), len(y), replace=True)
        tree = Tree(max_depth=max_depth, min_leaf=min_leaf)
        tree.fit(X[idx], y[idx])
        trees.append(tree)
    return trees


def forest_predict(trees, X):
    return np.mean([t.predict_proba(X) for t in trees], axis=0)


def cross_val(df, y, features, categorical, numerical, model_name, folds=5):
    indices = np.arange(len(df))
    np.random.shuffle(indices)
    fold_ids = np.array_split(indices, folds)
    scores = []
    for i in range(folds):
        test_idx = fold_ids[i]
        train_idx = np.concatenate([fold_ids[j] for j in range(folds) if j != i])
        prep = build_preprocessor(df.iloc[train_idx], features, categorical, numerical)
        X_train = transform(df.iloc[train_idx], prep)
        X_test = transform(df.iloc[test_idx], prep)
        if model_name == "logistic_regression":
            w, b = train_logistic(X_train, y[train_idx], steps=900)
            proba = sigmoid(X_test @ w + b)
        else:
            trees = train_forest(X_train, y[train_idx], n_trees=35, max_depth=7, min_leaf=12)
            proba = forest_predict(trees, X_test)
        scores.append(metrics(y[test_idx], proba))
    return {
        "folds": scores,
        "mean": {k: float(np.mean([s[k] for s in scores])) for k in ["accuracy", "precision", "recall", "f1", "roc_auc"]},
    }


def group_attrition(df, col):
    grouped = []
    for value, g in df.groupby(col, dropna=False):
        total = len(g)
        yes = int((g["Attrition"] == "Yes").sum())
        grouped.append({"label": str(value), "total": total, "attrition": yes, "rate": yes / total if total else 0})
    return sorted(grouped, key=lambda x: (-x["rate"], x["label"]))


def main():
    xl = pd.ExcelFile(DATASET)
    df = pd.read_excel(DATASET, sheet_name=xl.sheet_names[0])
    y = (df["Attrition"] == "Yes").astype(int).to_numpy()
    constant_cols = [c for c in df.columns if df[c].nunique(dropna=False) <= 1]
    leakage_or_id = ["Attrition", "EmployeeNumber"]
    excluded = sorted(set(constant_cols + leakage_or_id))
    features = [c for c in df.columns if c not in excluded]
    categorical = [c for c in features if not is_numeric_dtype(df[c])]
    numerical = [c for c in features if c not in categorical]

    train_idx, test_idx = stratified_split(y)
    prep = build_preprocessor(df.iloc[train_idx], features, categorical, numerical)
    X_train = transform(df.iloc[train_idx], prep)
    X_test = transform(df.iloc[test_idx], prep)

    w, b = train_logistic(X_train, y[train_idx])
    log_proba = sigmoid(X_test @ w + b)

    forest = train_forest(X_train, y[train_idx])
    rf_proba = forest_predict(forest, X_test)

    importances = Counter()
    for tree in forest:
        importances.update(tree.importance)
    total_importance = sum(importances.values()) or 1.0
    rf_importance = [
        {"feature": prep["encoded_features"][i], "importance": float(v / total_importance)}
        for i, v in importances.most_common(25)
    ]
    coef = sorted(
        [{"feature": f, "coefficient": float(c), "abs": float(abs(c))} for f, c in zip(prep["encoded_features"], w)],
        key=lambda x: x["abs"],
        reverse=True,
    )[:30]
    for item in coef:
        del item["abs"]

    sample_records = df.head(8).copy()
    export_df = df.where(pd.notnull(df), None)
    records = export_df.to_dict(orient="records")
    for i, row in enumerate(records):
        row["id"] = int(row.get("EmployeeNumber") or i + 1)

    profile = {
        "sourceFile": DATASET.name,
        "sheet": xl.sheet_names[0],
        "records": int(len(df)),
        "columns": int(len(df.columns)),
        "columnNames": list(df.columns),
        "dtypes": {c: str(df[c].dtype) for c in df.columns},
        "missingValues": {c: int(df[c].isna().sum()) for c in df.columns},
        "duplicates": int(df.duplicated().sum()),
        "numericalColumns": [c for c in df.columns if is_numeric_dtype(df[c])],
        "categoricalColumns": [c for c in df.columns if not is_numeric_dtype(df[c])],
        "targetColumn": "Attrition",
        "targetDistribution": {k: int(v) for k, v in df["Attrition"].value_counts().to_dict().items()},
        "classImbalance": {"positiveRate": float(y.mean()), "negativeRate": float(1 - y.mean())},
        "excludedFromTraining": excluded,
        "leakageNotes": [
            "Attrition is the target and is excluded from predictors.",
            "EmployeeNumber is an identifier and is excluded from predictors.",
            "EmployeeCount, Over18, and StandardHours are constant in this dataset and are excluded.",
        ],
    }

    analytics = {
        "overview": {
            "totalEmployees": int(len(df)),
            "attritionYes": int((df["Attrition"] == "Yes").sum()),
            "attritionNo": int((df["Attrition"] == "No").sum()),
            "attritionRate": float(y.mean()),
            "averageAge": float(df["Age"].mean()),
            "averageMonthlyIncome": float(df["MonthlyIncome"].mean()),
            "averageYearsAtCompany": float(df["YearsAtCompany"].mean()),
            "averageJobSatisfaction": float(df["JobSatisfaction"].mean()),
        },
        "groups": {
            col: group_attrition(df, col)
            for col in [
                "Department",
                "JobRole",
                "OverTime",
                "Gender",
                "BusinessTravel",
                "MaritalStatus",
                "JobSatisfaction",
                "WorkLifeBalance",
                "EducationField",
            ]
        },
        "ageGroups": group_attrition(df.assign(AgeGroup=pd.cut(df["Age"], [17, 25, 35, 45, 55, 65], labels=["18-25", "26-35", "36-45", "46-55", "56-65"])), "AgeGroup"),
        "incomeBands": group_attrition(df.assign(IncomeBand=pd.qcut(df["MonthlyIncome"], 5, duplicates="drop").astype(str)), "IncomeBand"),
        "yearsAtCompanyBands": group_attrition(df.assign(YearsBand=pd.cut(df["YearsAtCompany"], [-1, 2, 5, 10, 20, 45], labels=["0-2", "3-5", "6-10", "11-20", "21+"])), "YearsBand"),
    }

    app_data = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "profile": profile,
        "preprocessor": prep,
        "employees": records,
        "demoEmployees": sample_records.to_dict(orient="records"),
        "analytics": analytics,
        "models": {
            "defaultModel": "random_forest",
            "riskThresholds": {"low": 0.30, "medium": 0.60},
            "logistic_regression": {
                "displayName": "Logistic Regression",
                "intercept": float(b),
                "coefficients": [float(x) for x in w],
                "metrics": metrics(y[test_idx], log_proba),
                "rocCurve": roc_curve(y[test_idx], log_proba),
                "precisionRecall": pr_curve(y[test_idx], log_proba),
                "crossValidation": cross_val(df, y, features, categorical, numerical, "logistic_regression"),
                "topCoefficients": coef,
                "hyperparameters": {"learningRate": 0.08, "l2": 0.03, "steps": 1600, "classWeight": "balanced"},
            },
            "random_forest": {
                "displayName": "Random Forest",
                "trees": [t.nodes for t in forest],
                "metrics": metrics(y[test_idx], rf_proba),
                "rocCurve": roc_curve(y[test_idx], rf_proba),
                "precisionRecall": pr_curve(y[test_idx], rf_proba),
                "crossValidation": cross_val(df, y, features, categorical, numerical, "random_forest"),
                "featureImportance": rf_importance,
                "hyperparameters": {"trees": 80, "maxDepth": 7, "minLeaf": 10, "bootstrap": True, "randomSeed": SEED},
            },
        },
    }
    (OUT_DIR / "app-data.json").write_text(json.dumps(app_data, indent=2), encoding="utf-8")
    compact = json.dumps(app_data, separators=(",", ":"))
    (LIB_DIR / "app-data.js").write_text(f"export default {compact};\n", encoding="utf-8")

    values = []
    for row in records:
        payload = json.dumps(row).replace("'", "''")
        values.append(f"({int(row['EmployeeNumber'])}, '{row['Attrition']}', '{payload}'::jsonb)")
    seed = "INSERT INTO employees (employee_number, attrition, data)\nVALUES\n"
    seed += ",\n".join(values)
    seed += "\nON CONFLICT (employee_number) DO UPDATE SET attrition = EXCLUDED.attrition, data = EXCLUDED.data;\n"
    (ROOT / "seed.sql").write_text(seed, encoding="utf-8")
    print(json.dumps({"employees": len(records), "features": len(features), "encodedFeatures": len(prep["encoded_features"])}, indent=2))


if __name__ == "__main__":
    main()
