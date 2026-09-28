const state = {
  data: null,
  route: window.location.pathname === '/' ? '/dashboard' : window.location.pathname,
  page: 1,
  search: '',
  filters: {},
  predictions: JSON.parse(localStorage.getItem('worklytix.predictions') || '[]'),
};

const navItems = [
  ['/dashboard', 'Dashboard', 'D'],
  ['/employees', 'Employees', 'E'],
  ['/prediction', 'Prediction', 'P'],
  ['/analytics', 'Analytics', 'A'],
  ['/models', 'Models', 'M'],
  ['/explainability', 'Explainability', 'X'],
  ['/predictions', 'History', 'H'],
  ['/about', 'About', 'I'],
];

const app = document.querySelector('#app');
const title = document.querySelector('#pageTitle');
const toast = document.querySelector('#toast');

init();

async function init() {
  state.data = await fetch('/data/app-data.json').then((r) => r.json());
  renderNav();
  window.addEventListener('popstate', () => {
    state.route = window.location.pathname;
    render();
  });
  document.querySelector('#themeToggle').addEventListener('click', () => {
    document.documentElement.dataset.theme = document.documentElement.dataset.theme === 'dark' ? '' : 'dark';
  });
  document.body.addEventListener('click', routeClicks);
  render();
}

function routeClicks(event) {
  const link = event.target.closest('a[href^="/"]');
  if (!link) return;
  event.preventDefault();
  navigate(link.getAttribute('href'));
}

function navigate(route) {
  state.route = route;
  state.page = 1;
  history.pushState({}, '', route);
  render();
}

function renderNav() {
  document.querySelector('#nav').innerHTML = navItems
    .map(([href, label, icon]) => `<a class="nav-link" href="${href}" data-route="${href}"><span>${label}</span><strong>${icon}</strong></a>`)
    .join('');
}

function render() {
  document.querySelectorAll('.nav-link').forEach((a) => a.classList.toggle('active', a.dataset.route === state.route));
  const page = navItems.find(([href]) => href === state.route)?.[1] || 'Dashboard';
  title.textContent = page;
  const routes = {
    '/dashboard': dashboard,
    '/employees': employees,
    '/prediction': prediction,
    '/analytics': analytics,
    '/models': models,
    '/explainability': explainability,
    '/predictions': predictionHistory,
    '/about': about,
  };
  app.innerHTML = '';
  (routes[state.route] || dashboard)();
}

function fmt(value, digits = 0) {
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: digits });
}

function pct(value, digits = 1) {
  return `${(Number(value) * 100).toFixed(digits)}%`;
}

function employeeRows() {
  const employees = state.data.employees;
  return employees.filter((employee) => {
    const haystack = JSON.stringify(employee).toLowerCase();
    const matchesSearch = !state.search || haystack.includes(state.search.toLowerCase());
    const matchesFilters = Object.entries(state.filters).every(([key, value]) => !value || String(employee[key]) === String(value));
    return matchesSearch && matchesFilters;
  });
}

function filterControls(fields) {
  return `<div class="filters">
    ${fields
      .map((field) => {
        const values = [...new Set(state.data.employees.map((e) => e[field]))].sort();
        return `<select data-filter="${field}"><option value="">${field}</option>${values.map((v) => `<option ${state.filters[field] == v ? 'selected' : ''}>${v}</option>`).join('')}</select>`;
      })
      .join('')}
    <button class="secondary" id="clearFilters">Clear</button>
  </div>`;
}

function wireFilters() {
  document.querySelectorAll('[data-filter]').forEach((control) => {
    control.addEventListener('change', () => {
      state.filters[control.dataset.filter] = control.value;
      render();
    });
  });
  document.querySelector('#clearFilters')?.addEventListener('click', () => {
    state.filters = {};
    render();
  });
}

function applyFilters(rows) {
  return rows.filter((row) => Object.entries(state.filters).every(([key, value]) => !value || String(row[key]) === String(value)));
}

function overviewFor(rows) {
  const yes = rows.filter((e) => e.Attrition === 'Yes').length;
  const avg = (field) => rows.reduce((s, e) => s + Number(e[field] || 0), 0) / Math.max(rows.length, 1);
  return [
    ['Total Employees', rows.length],
    ['Attrition Yes', yes],
    ['Attrition No', rows.length - yes],
    ['Attrition Rate', pct(yes / Math.max(rows.length, 1))],
    ['Average Age', fmt(avg('Age'), 1)],
    ['Average Monthly Income', fmt(avg('MonthlyIncome'))],
    ['Average Years at Company', fmt(avg('YearsAtCompany'), 1)],
    ['Average Job Satisfaction', fmt(avg('JobSatisfaction'), 1)],
  ];
}

function dashboard() {
  const rows = applyFilters(state.data.employees);
  app.innerHTML = `
    <div class="toolbar card">
      <div>
        <h2>Workforce Dashboard</h2>
        <p class="muted">All metrics are calculated from ${state.data.profile.sourceFile}.</p>
      </div>
      ${filterControls(['Department', 'JobRole', 'Gender', 'OverTime'])}
    </div>
    <div class="grid kpi-grid">${overviewFor(rows).map(([label, value]) => `<div class="card kpi"><span class="muted">${label}</span><strong>${value}</strong></div>`).join('')}</div>
    <div class="grid two-col">
      ${chartCard('Attrition Distribution', groupRows(rows, 'Attrition'), 'bar')}
      ${chartCard('Attrition by Department', attritionGroups(rows, 'Department'), 'rate')}
      ${chartCard('Attrition by Overtime', attritionGroups(rows, 'OverTime'), 'rate')}
      ${chartCard('Attrition by Job Role', attritionGroups(rows, 'JobRole').slice(0, 9), 'rate')}
    </div>
  `;
  wireFilters();
  drawCharts();
}

function groupRows(rows, field) {
  const groups = {};
  rows.forEach((row) => (groups[row[field]] = (groups[row[field]] || 0) + 1));
  return Object.entries(groups).map(([label, value]) => ({ label, value }));
}

function attritionGroups(rows, field) {
  const groups = {};
  rows.forEach((row) => {
    groups[row[field]] ||= { label: row[field], total: 0, attrition: 0 };
    groups[row[field]].total += 1;
    groups[row[field]].attrition += row.Attrition === 'Yes' ? 1 : 0;
  });
  return Object.values(groups)
    .map((g) => ({ ...g, value: g.attrition / Math.max(g.total, 1) }))
    .sort((a, b) => b.value - a.value);
}

// Synchronous chart config registry — avoids the setTimeout race with drawCharts()
const _chartConfigs = {};

function chartCard(label, rows, type) {
  const id = `chart-${Math.random().toString(36).slice(2)}`;
  _chartConfigs[id] = { rows, type };
  return `<div class="card"><h3>${label}</h3><canvas class="chart" id="${id}" width="700" height="300"></canvas></div>`;
}

function drawCharts() {
  // Use requestAnimationFrame so canvases are laid out and sized before we paint
  requestAnimationFrame(() => {
    document.querySelectorAll('canvas.chart').forEach((canvas) => {
      const cfg = _chartConfigs[canvas.id];
      if (!cfg) return;
      const ctx = canvas.getContext('2d');
      const rows = cfg.rows.slice(0, 10);
      const max = Math.max(...rows.map((r) => r.value || 0), 0.01);
      const W = canvas.width;
      const H = canvas.height;
      const labelW = 210;
      const barW = W - labelW - 80;
      ctx.clearRect(0, 0, W, H);
      ctx.font = '13px system-ui, Segoe UI, sans-serif';
      const ink = getComputedStyle(document.documentElement).getPropertyValue('--ink') || '#1a2332';
      rows.forEach((row, i) => {
        const y = 24 + i * 27;
        const filled = ((row.value || 0) / max) * barW;
        // Bar background
        ctx.fillStyle = 'rgba(0,0,0,0.06)';
        ctx.fillRect(labelW, y, barW, 16);
        // Bar fill
        ctx.fillStyle = i % 2 ? '#b95d2c' : '#126c74';
        ctx.fillRect(labelW, y, filled, 16);
        // Label
        ctx.fillStyle = ink;
        ctx.fillText(String(row.label).slice(0, 27), 8, y + 13);
        // Value
        ctx.fillText(cfg.type === 'rate' ? pct(row.value) : fmt(row.value), labelW + barW + 6, y + 13);
      });
    });
  });
}

function employees() {
  const rows = employeeRows();
  const pageSize = 12;
  const start = (state.page - 1) * pageSize;
  const pageRows = rows.slice(start, start + pageSize);
  app.innerHTML = `
    <div class="toolbar card">
      <div><h2>Employee Records</h2><p class="muted">${fmt(rows.length)} matching records from the workbook.</p></div>
      <div class="filters">
        <input id="employeeSearch" placeholder="Search employees" value="${state.search}">
        ${filterControls(['Department', 'JobRole', 'OverTime', 'MaritalStatus'])}
      </div>
    </div>
    <div class="card table-wrap">
      <table>
        <thead><tr><th>Employee</th><th>Age</th><th>Department</th><th>Job Role</th><th>Monthly Income</th><th>Overtime</th><th>Satisfaction</th><th>Attrition</th><th></th></tr></thead>
        <tbody>${pageRows
          .map(
            (e) => `<tr>
              <td>${e.EmployeeNumber}</td><td>${e.Age}</td><td>${e.Department}</td><td>${e.JobRole}</td>
              <td>${fmt(e.MonthlyIncome)}</td><td>${e.OverTime}</td><td>${e.JobSatisfaction}</td>
              <td><span class="pill ${e.Attrition === 'Yes' ? 'bad' : 'good'}">${e.Attrition}</span></td>
              <td><button class="secondary" data-view="${e.EmployeeNumber}">View</button></td>
            </tr>`
          )
          .join('')}</tbody>
      </table>
    </div>
    <div class="row"><button class="secondary" id="prevPage">Previous</button><span class="muted">Page ${state.page} of ${Math.max(1, Math.ceil(rows.length / pageSize))}</span><button class="secondary" id="nextPage">Next</button></div>
  `;
  document.querySelector('#employeeSearch').addEventListener('input', (e) => {
    state.search = e.target.value;
    state.page = 1;
    employees();
  });
  document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => employeeDetail(Number(b.dataset.view))));
  document.querySelector('#prevPage').addEventListener('click', () => {
    state.page = Math.max(1, state.page - 1);
    employees();
  });
  document.querySelector('#nextPage').addEventListener('click', () => {
    state.page = Math.min(Math.ceil(rows.length / pageSize), state.page + 1);
    employees();
  });
  wireFilters();
}

function employeeDetail(id) {
  const e = state.data.employees.find((row) => row.EmployeeNumber === id);
  const comparison = compareModels(e);
  title.textContent = `Employee ${id}`;
  app.innerHTML = `
    <div class="row"><button class="secondary" id="backEmployees">Back</button><button id="useForPrediction">Use for Prediction</button></div>
    <div class="grid three-col">
      ${infoCard('Personal', [['Age', e.Age], ['Gender', e.Gender], ['Marital Status', e.MaritalStatus], ['Distance From Home', e.DistanceFromHome]])}
      ${infoCard('Job', [['Department', e.Department], ['Role', e.JobRole], ['Level', e.JobLevel], ['OverTime', e.OverTime]])}
      ${infoCard('Compensation', [['Monthly Income', fmt(e.MonthlyIncome)], ['Daily Rate', e.DailyRate], ['Hourly Rate', e.HourlyRate], ['Stock Options', e.StockOptionLevel]])}
      ${infoCard('Satisfaction', [['Environment', e.EnvironmentSatisfaction], ['Job', e.JobSatisfaction], ['Relationship', e.RelationshipSatisfaction], ['Work Life Balance', e.WorkLifeBalance]])}
      ${infoCard('Experience', [['Total Working Years', e.TotalWorkingYears], ['Years at Company', e.YearsAtCompany], ['Current Role', e.YearsInCurrentRole], ['Current Manager', e.YearsWithCurrManager]])}
      ${infoCard('Current Attrition Label', [['Dataset Value', e.Attrition], ['Model Estimate', pct(comparison[1].probability)], ['Risk Level', comparison[1].riskLevel]])}
    </div>
    ${modelComparisonTable(comparison)}
  `;
  document.querySelector('#backEmployees').addEventListener('click', () => {
    title.textContent = 'Employees';
    employees();
  });
  document.querySelector('#useForPrediction').addEventListener('click', () => {
    sessionStorage.setItem('worklytix.prefill', JSON.stringify(e));
    navigate('/prediction');
  });
}

function infoCard(label, pairs) {
  return `<div class="card"><h3>${label}</h3><table>${pairs.map(([k, v]) => `<tr><td class="muted">${k}</td><td>${v}</td></tr>`).join('')}</table></div>`;
}

function prediction() {
  const prefill = JSON.parse(sessionStorage.getItem('worklytix.prefill') || 'null') || state.data.demoEmployees[0];
  const prep = state.data.preprocessor;
  const sections = [
    ['Personal Information', ['Age', 'Gender', 'MaritalStatus', 'DistanceFromHome']],
    ['Job Information', ['Department', 'JobRole', 'JobLevel', 'BusinessTravel', 'OverTime']],
    ['Compensation', ['MonthlyIncome', 'MonthlyRate', 'DailyRate', 'HourlyRate', 'PercentSalaryHike', 'StockOptionLevel']],
    ['Satisfaction', ['EnvironmentSatisfaction', 'JobSatisfaction', 'JobInvolvement', 'RelationshipSatisfaction', 'WorkLifeBalance']],
    ['Experience', ['TotalWorkingYears', 'YearsAtCompany', 'YearsInCurrentRole', 'YearsSinceLastPromotion', 'YearsWithCurrManager', 'NumCompaniesWorked']],
    ['Education and Training', ['Education', 'EducationField', 'TrainingTimesLastYear']],
  ];
  app.innerHTML = `
    <form id="predictionForm" class="grid">
      ${sections.map(([label, fields]) => `<section class="card"><h2>${label}</h2><div class="form-grid">${fields.filter((f) => prep.features.includes(f)).map((f) => field(f, prefill)).join('')}</div></section>`).join('')}
      <div class="row"><button type="submit">Predict Attrition</button><button type="button" class="secondary" id="demoEmployee">Load Demo Employee</button></div>
    </form>
    <div id="predictionResult"></div>
  `;
  document.querySelector('#demoEmployee').addEventListener('click', () => {
    sessionStorage.setItem('worklytix.prefill', JSON.stringify(state.data.demoEmployees[Math.floor(Math.random() * state.data.demoEmployees.length)]));
    prediction();
  });
  document.querySelector('#predictionForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const input = Object.fromEntries(new FormData(event.target).entries());
    for (const col of prep.numerical) input[col] = Number(input[col]);
    showPrediction(input);
  });
}

function field(name, values) {
  const prep = state.data.preprocessor;
  const label = name.replace(/([A-Z])/g, ' $1').trim();
  if (prep.categorical.includes(name)) {
    return `<div class="field"><label>${label}</label><select name="${name}">${prep.categories[name].map((v) => `<option ${values[name] == v ? 'selected' : ''}>${v}</option>`).join('')}</select></div>`;
  }
  const stats = prep.numeric_stats[name];
  return `<div class="field"><label>${label}</label><input name="${name}" type="number" step="1" value="${values[name] ?? Math.round(stats.median)}" required></div>`;
}

function showPrediction(input) {
  const comparison = compareModels(input);
  const production = comparison[1];
  const item = { id: crypto.randomUUID(), date: new Date().toISOString(), input, comparison, production };
  state.predictions.unshift(item);
  localStorage.setItem('worklytix.predictions', JSON.stringify(state.predictions.slice(0, 100)));
  document.querySelector('#predictionResult').innerHTML = `
    <div class="result-band">
      <div class="card">
        <p class="eyebrow">Random Forest production model</p>
        <h2>${production.prediction}</h2>
        <div class="probability">${pct(production.probability)}</div>
        <span class="pill ${riskClass(production.riskLevel)}">${production.riskLevel} Risk</span>
        <p class="muted">Model-estimated attrition probability. This is not a guaranteed outcome.</p>
      </div>
      <div class="card"><h3>Factors influencing this model prediction</h3>${factorList(input)}</div>
    </div>
    ${modelComparisonTable(comparison)}
  `;
  notify('Prediction saved to local history.');
}

function modelComparisonTable(comparison) {
  return `<div class="card table-wrap"><h3>Model Comparison</h3><table><thead><tr><th>Model</th><th>Prediction</th><th>Probability</th><th>Risk</th></tr></thead><tbody>${comparison
    .map((m) => `<tr><td>${m.model}</td><td>${m.prediction}</td><td>${pct(m.probability)}</td><td><span class="pill ${riskClass(m.riskLevel)}">${m.riskLevel}</span></td></tr>`)
    .join('')}</tbody></table></div>`;
}

function riskClass(risk) {
  return risk === 'High' ? 'bad' : risk === 'Medium' ? 'warn' : 'good';
}

function transform(input) {
  const prep = state.data.preprocessor;
  const row = [];
  for (const col of prep.numerical) {
    const stats = prep.numeric_stats[col];
    const value = Number(input[col] ?? stats.median);
    row.push(((Number.isFinite(value) ? value : stats.median) - stats.mean) / stats.std);
  }
  for (const col of prep.categorical) {
    for (const category of prep.categories[col]) row.push(String(input[col]) === category ? 1 : 0);
  }
  return row;
}

function compareModels(input) {
  const row = transform(input);
  const logistic = state.data.models.logistic_regression;
  const logit = logistic.coefficients.reduce((sum, weight, i) => sum + weight * row[i], logistic.intercept);
  const logisticProbability = 1 / (1 + Math.exp(-Math.max(-35, Math.min(35, logit))));
  const rf = state.data.models.random_forest;
  const forestProbability = rf.trees.reduce((sum, tree) => sum + treeProb(tree, row), 0) / rf.trees.length;
  return [
    modelResult('Logistic Regression', 'logistic_regression', logisticProbability),
    modelResult('Random Forest', 'random_forest', forestProbability),
  ];
}

function treeProb(tree, row) {
  let i = 0;
  while (tree[i].feature !== null && tree[i].feature !== undefined) {
    i = row[tree[i].feature] <= tree[i].threshold ? tree[i].left : tree[i].right;
  }
  return tree[i].prob;
}

function modelResult(model, key, probability) {
  const risk = probability < 0.3 ? 'Low' : probability < 0.6 ? 'Medium' : 'High';
  return { model, key, probability, prediction: probability >= 0.5 ? 'Potential Attrition Risk' : 'Likely to Stay', riskLevel: risk };
}

function factorList(input) {
  const top = state.data.models.random_forest.featureImportance.slice(0, 7);
  return `<table>${top
    .map((f) => {
      if (f.feature.includes('=')) {
        const [raw, category] = f.feature.split('=');
        const active = String(input[raw]) === category ? 'Present' : 'Not present';
        return `<tr><td>${f.feature}</td><td>${active}</td><td>${pct(f.importance, 1)}</td></tr>`;
      }
      return `<tr><td>${f.feature}</td><td>${input[f.feature] ?? ''}</td><td>${pct(f.importance, 1)}</td></tr>`;
    })
    .join('')}</table><p class="muted">Feature importance shows model association, not causation.</p>`;
}

function analytics() {
  app.innerHTML = `
    <div class="card"><h2>Deeper Workforce Analytics</h2><p class="muted">Analyses are limited to fields present in the workbook.</p></div>
    <div class="grid two-col">
      ${chartCard('Business Travel', state.data.analytics.groups.BusinessTravel.map((x) => ({ label: x.label, value: x.rate })), 'rate')}
      ${chartCard('Marital Status', state.data.analytics.groups.MaritalStatus.map((x) => ({ label: x.label, value: x.rate })), 'rate')}
      ${chartCard('Age Group', state.data.analytics.ageGroups.map((x) => ({ label: x.label, value: x.rate })), 'rate')}
      ${chartCard('Monthly Income Bands', state.data.analytics.incomeBands.map((x) => ({ label: x.label, value: x.rate })), 'rate')}
      ${chartCard('Years at Company', state.data.analytics.yearsAtCompanyBands.map((x) => ({ label: x.label, value: x.rate })), 'rate')}
      ${chartCard('Education Field', state.data.analytics.groups.EducationField.map((x) => ({ label: x.label, value: x.rate })), 'rate')}
    </div>
  `;
  drawCharts();
}

function models() {
  const lr = state.data.models.logistic_regression;
  const rf = state.data.models.random_forest;
  app.innerHTML = `
    <div class="grid two-col">
      ${metricCard('Logistic Regression', lr)}
      ${metricCard('Random Forest', rf)}
    </div>
    <div class="card"><h3>Model Notes</h3><p class="muted">The test split is stratified with seed 42. Class imbalance is ${pct(state.data.profile.classImbalance.positiveRate)} attrition and ${pct(state.data.profile.classImbalance.negativeRate)} non-attrition. The Random Forest is configured as the production/default model because it has stronger accuracy and ROC-AUC on this split, while Logistic Regression has higher recall.</p></div>
    <div class="grid two-col">
      ${chartCard('Random Forest Feature Importance', rf.featureImportance.slice(0, 10).map((x) => ({ label: x.feature, value: x.importance })), 'rate')}
      ${chartCard('Logistic Regression Coefficients', lr.topCoefficients.slice(0, 10).map((x) => ({ label: x.feature, value: Math.abs(x.coefficient) })), 'rate')}
    </div>
  `;
  drawCharts();
}

function metricCard(label, model) {
  const m = model.metrics;
  return `<div class="card"><h2>${label}</h2><table>
    <tr><td>Accuracy</td><td>${pct(m.accuracy)}</td></tr>
    <tr><td>Precision</td><td>${pct(m.precision)}</td></tr>
    <tr><td>Recall</td><td>${pct(m.recall)}</td></tr>
    <tr><td>F1 Score</td><td>${pct(m.f1)}</td></tr>
    <tr><td>ROC-AUC</td><td>${pct(m.roc_auc)}</td></tr>
    <tr><td>Confusion Matrix</td><td>TN ${m.confusion_matrix.tn}, FP ${m.confusion_matrix.fp}, FN ${m.confusion_matrix.fn}, TP ${m.confusion_matrix.tp}</td></tr>
    <tr><td>CV ROC-AUC</td><td>${pct(model.crossValidation.mean.roc_auc)}</td></tr>
  </table></div>`;
}

function explainability() {
  app.innerHTML = `
    <div class="card"><h2>Explainable AI</h2><p class="muted">These associations come from the trained models and do not prove causation.</p></div>
    <div class="grid two-col">
      <div class="card table-wrap"><h3>Random Forest Feature Importance</h3>${rankTable(state.data.models.random_forest.featureImportance, 'importance')}</div>
      <div class="card table-wrap"><h3>Logistic Regression Coefficients</h3>${rankTable(state.data.models.logistic_regression.topCoefficients, 'coefficient')}</div>
    </div>
  `;
}

function rankTable(rows, field) {
  return `<table><thead><tr><th>Feature</th><th>${field}</th></tr></thead><tbody>${rows
    .slice(0, 20)
    .map((r) => `<tr><td>${r.feature}</td><td>${field === 'importance' ? pct(r[field], 2) : Number(r[field]).toFixed(3)}</td></tr>`)
    .join('')}</tbody></table>`;
}

function predictionHistory() {
  const preds = state.predictions;

  // ── Charts ──────────────────────────────────────────────────────────────────
  // 1. Risk distribution (bar)
  const riskCounts = { Low: 0, Medium: 0, High: 0 };
  preds.forEach((p) => riskCounts[p.production.riskLevel]++);
  const riskRows = Object.entries(riskCounts).map(([label, value]) => ({ label, value }));

  // 2. Probability trend (last 20, chronological order)
  const trend = preds.slice(0, 20).reverse();

  // Build chart IDs for the trend canvas — we handle it manually
  const trendId = `chart-trend-${Math.random().toString(36).slice(2)}`;

  app.innerHTML = `
    <div class="card"><h2>Prediction History</h2><p class="muted">${preds.length} prediction${preds.length !== 1 ? 's' : ''} stored in this browser.</p></div>

    ${preds.length ? `
    <div class="grid two-col">
      ${chartCard('Risk Level Distribution', riskRows, 'bar')}
      <div class="card">
        <h3>Attrition Probability Trend</h3>
        <canvas id="${trendId}" class="chart-trend" width="700" height="260"></canvas>
        ${trend.length < 2 ? '<p class="muted" style="padding:1rem">Add more predictions to see the trend line.</p>' : ''}
      </div>
    </div>` : ''}

    <div class="card table-wrap">
      <table>
        <thead><tr><th>#</th><th>Date</th><th>Prediction</th><th>LR Probability</th><th>RF Probability</th><th>Risk</th><th></th></tr></thead>
        <tbody>${preds
          .map((p, i) => {
            const lr = p.comparison.find((c) => c.key === 'logistic_regression');
            const rf = p.comparison.find((c) => c.key === 'random_forest');
            return `<tr>
              <td class="muted">${preds.length - i}</td>
              <td>${new Date(p.date).toLocaleString()}</td>
              <td>${p.production.prediction}</td>
              <td>${lr ? pct(lr.probability) : '—'}</td>
              <td>${rf ? pct(rf.probability) : '—'}</td>
              <td><span class="pill ${riskClass(p.production.riskLevel)}">${p.production.riskLevel}</span></td>
              <td><button class="secondary" data-delete="${p.id}">✕</button></td>
            </tr>`;
          })
          .join('') || '<tr><td colspan="7" class="muted" style="padding:1rem">No predictions yet. Go to <a href="/prediction">Prediction</a> to get started.</td></tr>'}
        </tbody>
      </table>
    </div>

    ${preds.length ? `<div class="row"><button class="secondary" id="clearHistory">Clear All History</button></div>` : ''}
  `;

  // Wire delete buttons
  document.querySelectorAll('[data-delete]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.predictions = state.predictions.filter((p) => p.id !== btn.dataset.delete);
      localStorage.setItem('worklytix.predictions', JSON.stringify(state.predictions));
      predictionHistory();
    });
  });

  document.querySelector('#clearHistory')?.addEventListener('click', () => {
    state.predictions = [];
    localStorage.removeItem('worklytix.predictions');
    predictionHistory();
  });

  // Draw risk bar chart via shared drawCharts()
  drawCharts();

  // Draw trend line manually
  if (trend.length >= 2) {
    requestAnimationFrame(() => {
      const canvas = document.getElementById(trendId);
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      const W = canvas.width;
      const H = canvas.height;
      const PAD = { top: 20, right: 20, bottom: 40, left: 50 };
      const plotW = W - PAD.left - PAD.right;
      const plotH = H - PAD.top - PAD.bottom;
      const ink = getComputedStyle(document.documentElement).getPropertyValue('--ink') || '#1a2332';

      ctx.clearRect(0, 0, W, H);

      // Grid lines at 0%, 30%, 60%, 100%
      ctx.strokeStyle = 'rgba(0,0,0,0.08)';
      ctx.lineWidth = 1;
      [0, 0.3, 0.6, 1].forEach((v) => {
        const y = PAD.top + plotH - v * plotH;
        ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(PAD.left + plotW, y); ctx.stroke();
        ctx.fillStyle = ink;
        ctx.font = '11px system-ui, sans-serif';
        ctx.fillText(`${Math.round(v * 100)}%`, 4, y + 4);
      });

      // Risk threshold bands
      const y30 = PAD.top + plotH - 0.3 * plotH;
      const y60 = PAD.top + plotH - 0.6 * plotH;
      ctx.fillStyle = 'rgba(16,185,129,0.07)';
      ctx.fillRect(PAD.left, y30, plotW, PAD.top + plotH - y30);     // Low
      ctx.fillStyle = 'rgba(245,158,11,0.07)';
      ctx.fillRect(PAD.left, y60, plotW, y30 - y60);                  // Medium
      ctx.fillStyle = 'rgba(220,53,69,0.07)';
      ctx.fillRect(PAD.left, PAD.top, plotW, y60 - PAD.top);          // High

      // Data points
      const pts = trend.map((p, i) => {
        const x = PAD.left + (i / (trend.length - 1)) * plotW;
        const y = PAD.top + plotH - p.production.probability * plotH;
        return { x, y, p };
      });

      // LR line
      const lrPts = trend.map((p, i) => {
        const lr = p.comparison.find((c) => c.key === 'logistic_regression');
        const x = PAD.left + (i / (trend.length - 1)) * plotW;
        const y = PAD.top + plotH - (lr ? lr.probability : p.production.probability) * plotH;
        return { x, y };
      });

      // Draw RF line
      ctx.strokeStyle = '#126c74';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      pts.forEach(({ x, y }, i) => i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y));
      ctx.stroke();

      // Draw LR line
      ctx.strokeStyle = '#b95d2c';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      lrPts.forEach(({ x, y }, i) => i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y));
      ctx.stroke();
      ctx.setLineDash([]);

      // Dots on RF line
      pts.forEach(({ x, y, p }) => {
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fillStyle = p.production.riskLevel === 'High' ? '#dc3545' : p.production.riskLevel === 'Medium' ? '#f59e0b' : '#10b981';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      });

      // X-axis labels (first, middle, last)
      ctx.fillStyle = ink;
      ctx.font = '11px system-ui, sans-serif';
      [0, Math.floor((trend.length - 1) / 2), trend.length - 1].forEach((i) => {
        const { x } = pts[i];
        const label = `#${state.predictions.length - (state.predictions.indexOf(trend[i]))}`; 
        ctx.fillText(label, x - 8, H - 8);
      });

      // Legend
      const ly = H - 8;
      ctx.fillStyle = '#126c74'; ctx.fillRect(W - 180, ly - 10, 18, 3);
      ctx.fillStyle = ink; ctx.fillText('Random Forest', W - 158, ly);
      ctx.strokeStyle = '#b95d2c'; ctx.setLineDash([5, 4]); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(W - 90, ly - 8); ctx.lineTo(W - 72, ly - 8); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = ink; ctx.fillText('Log. Reg.', W - 68, ly);
    });
  }
}

function about() {
  const p = state.data.profile;
  app.innerHTML = `
    <div class="card"><h2>Employee Attrition Prediction using Logistic Regression and Random Forest</h2><p class="muted">Purpose: predict employee attrition probability with machine learning and provide interactive workforce analytics.</p></div>
    <div class="grid two-col">
      ${infoCard('Dataset Profile', [['Records', p.records], ['Columns', p.columns], ['Target', p.targetColumn], ['Missing Values', Object.values(p.missingValues).reduce((a, b) => a + b, 0)], ['Duplicates', p.duplicates], ['Attrition Yes', p.targetDistribution.Yes], ['Attrition No', p.targetDistribution.No]])}
      ${infoCard('Training Safeguards', [['Excluded Fields', p.excludedFromTraining.join(', ')], ['Default Model', 'Random Forest'], ['Risk Thresholds', 'Low < 30%, Medium 30-60%, High >= 60%'], ['Generated At', new Date(state.data.generatedAt).toLocaleString()]])}
    </div>
    <div class="card"><h3>Responsible AI Use</h3><p class="muted">Predictions are probabilistic. Historical HR data can contain bias. Performance depends on the training data. Correlation does not establish causation. This tool supports HR analysis and should not automatically determine employment actions.</p></div>
  `;
}

function notify(message) {
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2400);
}
