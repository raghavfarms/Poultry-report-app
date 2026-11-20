import { api } from '../../api/client.js';

// ==========================================
// 1. QUESTIONS MASTER
// ==========================================
export async function getQuestions(params = {}) {
  const query = new URLSearchParams(params).toString();
  return api(`/performance/questions${query ? `?${query}` : ''}`);
}

export async function createQuestion(data) {
  return api('/performance/questions', {
    method: 'POST',
    body: data,
  });
}

export async function translateQuestion(text) {
  return api('/performance/questions/translate', {
    method: 'POST',
    body: { text },
  });
}

export async function updateQuestion(id, data) {
  return api(`/performance/questions/${id}`, {
    method: 'PUT',
    body: data,
  });
}

export async function deleteQuestion(id, { permanent = false } = {}) {
  const query = permanent ? '?permanent=true' : '';
  return api(`/performance/questions/${id}${query}`, {
    method: 'DELETE',
  });
}

// ==========================================
// 2. GRADE & SALARY MASTER
// ==========================================
export async function getGradeSalaryConfig(params = {}) {
  const query = new URLSearchParams(params).toString();
  return api(`/performance/config${query ? `?${query}` : ''}`);
}

export async function updateGradeSalaryConfig(data, params = {}) {
  const query = new URLSearchParams(params).toString();
  return api(`/performance/config${query ? `?${query}` : ''}`, {
    method: 'PUT',
    body: data,
  });
}

// ==========================================
// 3. DAILY EVALUATION
// ==========================================
export async function getDailyEvaluationMatrix(params = {}) {
  const query = new URLSearchParams(params).toString();
  return api(`/performance/evaluations/daily?${query}`);
}

export async function submitDailyEvaluation(data) {
  return api('/performance/evaluations/daily', {
    method: 'POST',
    body: data,
  });
}

// ==========================================
// 4. WORKERS & SALARY
// ==========================================
export async function getMonthlySalarySummary(params = {}) {
  const query = new URLSearchParams(params).toString();
  return api(`/performance/salary/summary?${query}`);
}

export async function updateSalaryRevision(data) {
  return api('/performance/salary/revision', {
    method: 'POST',
    body: data,
  });
}

export async function recordSalaryPayment(data) {
  return api('/performance/salary/payment', {
    method: 'POST',
    body: data,
  });
}
