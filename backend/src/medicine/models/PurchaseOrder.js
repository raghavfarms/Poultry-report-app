
import mongoose from 'mongoose';

// 1. Subdocument Schema for individual medicine items inside a PO
const poItemSchema = new mongoose.Schema(
  {
    medicine: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MedicineMaster',
      required: [true, 'Medicine is required for each PO item'],
    },
    orderedQuantity: {
      type: Number,
      required: [true, 'Ordered quantity is required'],
      min: [1, 'Ordered quantity must be at least 1'],
    },
    receivedQuantity: {
      type: Number,
      default: 0,
      min: [0, 'Received quantity cannot be negative'],
    },
    unitPrice: {
      type: Number,
      min: [0, 'Unit price cannot be negative'],
      default: 0,
    },
    totalPrice: {
      type: Number,
      min: [0, 'Total price cannot be negative'],
      default: 0,
    },
  },
  { _id: false } // We don't need a separate _id for each item row
);

// 2. Main Purchase Order Schema
const purchaseOrderSchema = new mongoose.Schema(
  {
    // Unique human-readable PO number, e.g., "PO-2026-0001"
    poNumber: {
      type: String,
      required: [true, 'PO Number is required'],
      unique: true,
      uppercase: true,
      trim: true,
    },

    // Supplier from whom we are purchasing
    supplier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Supplier',
      required: [true, 'Supplier is required'],
      index: true,
    },

    // Order date (defaults to today's date YYYY-MM-DD)
    orderDate: {
      type: String,
      required: [true, 'Order date is required'],
    },

    // Expected delivery date
    expectedDeliveryDate: {
      type: String,
      default: null,
    },

    // Array of medicine items
    items: {
      type: [poItemSchema],
      validate: {
        validator: function (val) {
          return val && val.length > 0;
        },
        message: 'A Purchase Order must contain at least one item',
      },
    },

    // Total monetary amount for the whole PO
    totalAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    // PO Status lifecycle
    status: {
      type: String,
      enum: {
        values: ['DRAFT', 'ISSUED', 'PARTIALLY_RECEIVED', 'FULFILLED', 'CANCELLED'],
        message: '{VALUE} is not a valid PO status',
      },
      default: 'DRAFT',
      index: true,
    },

    notes: {
      type: String,
      trim: true,
      default: '',
      maxlength: 500,
    },

    // Audit trail: Who created this PO?
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    // Audit trail: Who last updated this PO?
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true, // Automatically manages createdAt and updatedAt
  }
);

export default mongoose.model('PurchaseOrder', purchaseOrderSchema);