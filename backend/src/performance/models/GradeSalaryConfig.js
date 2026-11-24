import mongoose from 'mongoose';

const gradeThresholdSchema = new mongoose.Schema({
  minPercentage: { type: Number, default: 80, min: 0, max: 100 }, // Admin configurable % (e.g. A=80%, B=50%)
  minScore: { type: Number, default: 8 },
  maxScore: { type: Number, default: 10 },
  numericalPoints: { type: Number, default: 10 }, // e.g. A=10, B=6, C=3
}, { _id: false });

const schema = new mongoose.Schema({
  // Null firm means default/global config; can be overridden per firm if needed
  firm: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Firm', 
    default: null,  
    index: true 
  },
  
  // Section A: Grade Configuration (Admin configurable percentage thresholds)
  gradeRules: {
    gradeA: { 
      type: gradeThresholdSchema, 
      default: () => ({ minPercentage: 80, minScore: 8, maxScore: 10, numericalPoints: 10 }) 
    },
    gradeB: {  
      type: gradeThresholdSchema, 
      default: () => ({ minPercentage: 65, minScore: 6, maxScore: 7, numericalPoints: 6 }) 
    },
    gradeC: { 
      type: gradeThresholdSchema, 
      default: () => ({ minPercentage: 50, minScore: 5, maxScore: 6, numericalPoints: 3 }) 
    },
    gradeD: { 
      type: gradeThresholdSchema, 
      default: () => ({ minPercentage: 0, minScore: 0, maxScore: 4, numericalPoints: 0 }) 
    },
  },

  // What grade to assign if a worker commits a critical violation (alcohol, fighting, etc.)
  criticalViolationGrade: { 
    type: String, 
    enum: ['A', 'B', 'C', 'D'], 
    default: 'D' 
  },

  // Minimum days an evaluation must be submitted in a month to qualify for Grade A/B
  minEvaluationDaysRequired: {  
    type: Number, 
    default: 22, 
    min: 1,
  }, 

  // Half day worker evaluation policy
  halfDayPolicy: { 
    allowEvaluation: { type: Boolean, default: true },
    scoreMultiplier: { type: Number, default: 0.5, min: 0, max: 1 }, // Half-day weight  
  },

  // Section B: Default / Fallback Monthly Salary per Grade
  gradeSalaries: {
    gradeA: { type: Number, default: 11500, min: 0 },
    gradeB: { type: Number, default: 10500, min: 0 },
    gradeC: { type: Number, default: 9500, min: 0 },
    gradeD: { type: Number, default: 0, min: 0 },
  },

  // Section C: Designation-based Category Salaries (e.g. Supervisor, Driver, Shed Worker)
  designationSalaries: [
    {
      designation: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'AttendanceDesignation',
        required: true,
      },
      designationName: { type: String, default: '' },
      gradeA: { type: Number, default: 11500, min: 0 },
      gradeB: { type: Number, default: 10500, min: 0 },
      gradeC: { type: Number, default: 9500, min: 0 },
      gradeD: { type: Number, default: 0, min: 0 },
    }
  ],

  // Section B: Salary Rules 
  salaryIncrementRules: {
    incrementType: { 
      type: String, 
      enum: ['FIXED', 'PERCENTAGE'], 
      default: 'FIXED' 
    },
    gradeAIncrement: { type: Number, default: 1500, min: 0 },
    gradeBIncrement: { type: Number, default: 800, min: 0 },
    gradeCIncrement: { type: Number, default: 0, min: 0 },
  },

  // Salary payout cycle dates (managed around 22nd of each month)
  salaryCycle: {
    paymentDay: { type: Number, default: 22, min: 1, max: 31 },
    cutoffDay: { type: Number, default: 20, min: 1, max: 31 },
  },

  active: { type: Boolean, default: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { 
  timeStamp:true 
});

export default mongoose.model('GradeSalaryConfig', schema); 




