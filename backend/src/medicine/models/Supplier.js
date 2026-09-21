
import mongoose from 'mongoose'

const supplierSchema = new mongoose.Schema({

  // 1. Unique code for every supplier (e.g. SUP-001)
    code: {
      type: String,
      required: [true, 'Supplier code is required'],
      trim: true,
      uppercase: true,
      unique: true,
      maxlength: 30,
    },
    // 2. Supplier / Company Name
    name: {
      type: String,
      required: [true, 'Supplier name is required'],
      trim: true,
      maxlength: 120,
    },
    // 3. Contact Person (e.g. "Rajesh Kumar - Sales Manager")
    contactPerson: {
      type: String,
      trim: true,
      default: '',
    },
    // 4. Mobile / Phone Number
    mobile: {
      type: String,
      trim: true,
      default: '',
    },
    // 5. Email address (lowercase: true converts 'ABC@GMAIL.COM' to 'abc@gmail.com')
    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: '',
    },
    // 6. Physical Office/Warehouse Address
    address: {
      type: String,
      trim: true,
      default: '',
    },
    // 7. GSTIN (Tax Identification Number)
    gstin: {
      type: String,
      trim: true,
      uppercase: true,
      default: '',
    },
    // 8. Soft Delete: Deactivate rather than delete to preserve transaction history
    active: {
      type: Boolean,
      default: true,
      index: true,
    },
    // 9. Audit trail: Who created this supplier record?
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true, // Automatically manages createdAt and updatedAt



})

export default mongoose.model('Supplier',supplierSchema)