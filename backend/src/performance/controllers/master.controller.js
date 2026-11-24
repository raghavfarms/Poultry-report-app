import PerformanceQuestion from '../models/PerformanceQuestion.js';
import GradeSalaryConfig from '../models/GradeSalaryConfig.js';
import Designation from '../../attendance/models/Designation.js';
import { badRequest, notFoundError } from '../../utils/http.js';
import { convertToHindi } from '../utils/hindiTranslator.js';


// Initial 6 Hindi questions as requested by the client
const DEFAULT_QUESTIONS = [
  { questionText: 'क्या कर्मचारी आज समय पर काम पर आया?', displayOrder: 1, weight: 1, isCriticalViolation: false },
  { questionText: 'क्या कर्मचारी शराब पीकर काम पर तो नहीं आया?', displayOrder: 2, weight: 2, isCriticalViolation: true },
  { questionText: 'क्या कर्मचारी ने आज किसी से लड़ाई-झगड़ा तो नहीं किया?', displayOrder: 3, weight: 2, isCriticalViolation: true },
  { questionText: 'क्या कर्मचारी ने आज उसे सौंपे गए सारे काम पूरे किए?', displayOrder: 4, weight: 1, isCriticalViolation: false },
  { questionText: 'क्या कर्मचारी ने काम के दौरान लापरवाही नहीं की?', displayOrder: 5, weight: 1, isCriticalViolation: false },
  { questionText: 'क्या कर्मचारी ने अपने सीनियर के निर्देशों का पालन किया?', displayOrder: 6, weight: 1, isCriticalViolation: false },
];

// ==========================================
// 1. QUESTIONS MASTER
// ==========================================

export async function getQuestions(req, res) {
  const { firmId, includeInactive } = req.query;
  const filter = {};

  if (includeInactive !== 'true') {
    filter.active = true;
  }

  let questions = await PerformanceQuestion.find(filter)
    .sort({ displayOrder: 1, createdAt: 1 })
    .lean();

  if (firmId && firmId !== 'all') {
    // Filter questions applicable to this firm or ALL
    questions = questions.filter(
      (q) => q.firmApplicability === 'ALL' || String(q.firmApplicability) === String(firmId)
    );
  }

  res.json({ success: true, questions });
}

export async function createQuestion(req, res) {
  const { questionText, displayOrder, firmApplicability, weight, isCriticalViolation, appliesToHalfDay, autoTranslate } = req.body;

  if (!questionText || !questionText.trim()) {
    throw badRequest('Question text is required.');
  }

  let textToSave = questionText.trim();
  if (autoTranslate === true) {
    textToSave = await convertToHindi(textToSave);
  }

  const question = await PerformanceQuestion.create({
    questionText: textToSave,
    displayOrder: Number(displayOrder) || 0,
    firmApplicability: firmApplicability || 'ALL',
    weight: Number(weight) || 1,
    isCriticalViolation: Boolean(isCriticalViolation),
    appliesToHalfDay: appliesToHalfDay !== false,
    createdBy: req.user._id,
  });

  res.status(201).json({ success: true, question });
}

export async function updateQuestion(req, res) {
  const { id } = req.params;
  const existing = await PerformanceQuestion.findById(id);
  if (!existing) throw notFoundError('Question not found.');

  const updateFields = { ...req.body, updatedBy: req.user._id };
  if (updateFields.questionText && req.body.autoTranslate === true) {
    updateFields.questionText = await convertToHindi(updateFields.questionText.trim());
  }

  const question = await PerformanceQuestion.findByIdAndUpdate(id, updateFields, {
    new: true,
    runValidators: true,
  });

  res.json({ success: true, question });
}

// Quick live translation preview helper
export async function translateQuestionText(req, res) {
  const { text } = req.body;
  if (!text || !text.trim()) {
    return res.json({ success: true, text: '' });
  }
  const hindi = await convertToHindi(text.trim());
  res.json({ success: true, text: hindi });
}

export async function deleteQuestion(req, res) {
  const { id } = req.params;
  const existing = await PerformanceQuestion.findById(id);
  if (!existing) throw notFoundError('Question not found.');

  await PerformanceQuestion.findByIdAndDelete(id);
  res.json({ success: true, message: 'Question deleted permanently from database.' });
}

// ==========================================
// 2. GRADE & SALARY MASTER
// ==========================================

// Standardize and normalize worker category names across firms (e.g. Raghav & Sanjana)
export function standardizeCategoryName(name = '') {
  const trimmed = (name || '').trim();
  const lower = trimmed.toLowerCase();
  
  if (lower.includes('night guard') || lower.includes('night')) return 'Night Guard';
  if (lower.includes('supervisor')) return 'Supervisor';
  if (lower.includes('farm incharge') || lower.includes('incharge')) return 'Farm Incharge';
  if (lower.includes('shed')) return 'Shed Worker';
  if (lower.includes('feed')) return 'Feed Mill Worker';
  if (lower.includes('outside')) return 'Outside Worker';
  if (lower.includes('organic')) return 'Organics Worker';
  if (lower.includes('clean')) return 'Main & Cleaning Worker';
  if (lower.includes('cold room')) return 'Cold Room Worker';
  if (lower.includes('office')) return 'Office Staff';
  if (lower.includes('electrician')) return 'Electrician';
  if (lower.includes('security')) return 'Security';
  if (lower.includes('plumber')) return 'Plumber';
  if (lower.includes('driver')) return 'Driver';
  if (lower.includes('female') || lower.includes('mahila') || lower.includes('महिला')) return 'Female Worker';
  if (lower.includes('accountant')) return 'Accountant';
  if (lower.includes('developer')) return 'Developer';
  if (lower.includes('management')) return 'Management';
  if (lower.includes('head')) return 'Head';
  if (lower.includes('support')) return 'Support Staff';
  if (lower.includes('manpower') || lower.includes('poultry') || lower.includes('farm worker')) return 'Farm / General Worker';
  
  return trimmed
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

export async function getGradeSalaryConfig(req, res) {
  const { firmId } = req.query;
  const filter = firmId && firmId !== 'all' ? { firm: firmId, active: true } : { firm: null, active: true };

  let config = await GradeSalaryConfig.findOne(filter).lean();

  // If no config found, initialize the default standard config on 10-point scale
  if (!config) {
    config = await GradeSalaryConfig.create({
      firm: firmId && firmId !== 'all' ? firmId : null,
      gradeRules: {
        gradeA: { minPercentage: 80, minScore: 8, maxScore: 10, numericalPoints: 10 },
        gradeB: { minPercentage: 65, minScore: 6, maxScore: 7, numericalPoints: 6 },
        gradeC: { minPercentage: 50, minScore: 5, maxScore: 6, numericalPoints: 3 },
        gradeD: { minPercentage: 0, minScore: 0, maxScore: 4, numericalPoints: 0 },
      },
      updatedBy: req.user._id,
    });
  }

  // Dynamically calculate score brackets based on currently active questions, weights, and admin-configured percentages
  const activeQuestions = await PerformanceQuestion.find({ active: true }).lean();
  const totalQuestions = activeQuestions.length;
  const totalWeight = activeQuestions.reduce((acc, q) => acc + (q.weight || 1), 0) || 10;
  
  const percentA = config.gradeRules?.gradeA?.minPercentage || 85;
  const percentB = config.gradeRules?.gradeB?.minPercentage || 77;
  const percentC = (config.gradeRules?.gradeC?.minPercentage > 0) ? config.gradeRules.gradeC.minPercentage : 50;
  const minScoreA = Math.round(totalWeight * (percentA / 100));
  const minScoreB = Math.round(totalWeight * (percentB / 100));
  const minScoreC = Math.round(totalWeight * (percentC / 100));

  // Ensure config object sent to client has sanitized positive values
  if (config.gradeRules) {
    if (!config.gradeRules.gradeA?.minPercentage) config.gradeRules.gradeA = { ...config.gradeRules.gradeA, minPercentage: percentA };
    if (!config.gradeRules.gradeB?.minPercentage) config.gradeRules.gradeB = { ...config.gradeRules.gradeB, minPercentage: percentB };
    if (!config.gradeRules.gradeC?.minPercentage || config.gradeRules.gradeC.minPercentage <= 0) {
      config.gradeRules.gradeC = { ...config.gradeRules.gradeC, minPercentage: percentC };
    }
  }
   
  // Fetch active farm designations and group them into unique, deduplicated job categories
  const allDesignations = await Designation.find({ active: true })
    .select('_id name')
    .sort({ name: 1 })
    .lean();

  const categoryMap = new Map();

  // 1. Always ensure 'Female Worker' exists as a dedicated category
  categoryMap.set('Female Worker', {
    categoryKey: 'female_worker',
    categoryName: 'Female Worker',
    designationIds: [],
    sampleName: 'Female Worker',
  });

  // Excluded categories (Head office, IT, management, or non-farm operational roles)
  const EXCLUDED_CATEGORIES = new Set([
    'accountant',
    'developer',
    'head',
    'main & cleaning worker',
    'cleaning worker',
    'management',
    'outside worker',
    'support staff',
    'plumber',
    'organics worker',
    'organic worker',
  ]);

  // 2. Group all designations by standardized name across Raghav, Sanjana & other firms
  for (const d of allDesignations) {
    const stdName = standardizeCategoryName(d.name);
    const key = stdName.toLowerCase().replace(/[^a-z0-9]+/g, '_');

    if (EXCLUDED_CATEGORIES.has(stdName.toLowerCase())) {
      continue;
    }

    if (!categoryMap.has(stdName)) {
      categoryMap.set(stdName, {
        categoryKey: key,
        categoryName: stdName,
        designationIds: [],
        sampleName: d.name,
      });
    }
    categoryMap.get(stdName).designationIds.push(d._id);
  }

  // Priority order for categories in table (Supervisor & Night Guard on top, Female Worker prominent)
  const priorityOrder = [
    'Supervisor',
    'Night Guard',
    'Female Worker',
    'Farm Incharge',
    'Shed Worker',
    'Feed Mill Worker',
    'Cold Room Worker',
    'Electrician',
    'Driver',
    'Security',
    'Office Staff',
    'Farm / General Worker',
  ];

  const categories = Array.from(categoryMap.values())
    .filter((c) => !EXCLUDED_CATEGORIES.has(c.categoryName.toLowerCase()))
    .sort((a, b) => {
      const idxA = priorityOrder.indexOf(a.categoryName);
      const idxB = priorityOrder.indexOf(b.categoryName);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.categoryName.localeCompare(b.categoryName);
    });
   
  res.json({
    success: true,
    config,
    categories, // Clean, deduplicated job categories
    designations: allDesignations,
    questionSummary: {
      totalQuestions,
      totalWeight,
      gradeA: { minPercentage: percentA, minScore: minScoreA, maxScore: totalWeight },
      gradeB: { minPercentage: percentB, minScore: minScoreB, maxScore: Math.max(minScoreB, minScoreA - 1) },
      gradeC: { minPercentage: percentC, minScore: minScoreC, maxScore: Math.max(minScoreC, minScoreB - 1) },
      gradeD: { minPercentage: 0, minScore: 0, maxScore: Math.max(0, minScoreC - 1) },
    },
  });
}

export async function updateGradeSalaryConfig(req, res) {
  const { firmId } = req.query;
  const filter = firmId && firmId !== 'all' ? { firm: firmId } : { firm: null };

  const updated = await GradeSalaryConfig.findOneAndUpdate(
    filter,
    { ...req.body, updatedBy: req.user._id },
    { new: true, upsert: true, runValidators: true }
  );

  res.json({ success: true, config: updated });
}