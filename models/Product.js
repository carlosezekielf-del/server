const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  price: { type: Number, required: true, min: 0 },
  stock: { type: Number, required: true, min: 0, default: 0 },
  category: {
    type: String,
    required: true,
    enum: ['Action Figures', 'Statues', 'Model Kits', 'Plushies', 'Trading Cards', 'Accessories', 'Other'],
    default: 'Other'
  },
  image: { type: String, default: '' },
  platform: { type: String, enum: ['Own Website', 'Mobile App', 'Other'], default: 'Own Website' },
  status: { type: String, enum: ['active', 'inactive', 'out_of_stock'], default: 'active' },
  sales: { type: Number, default: 0 },
  featured: { type: Boolean, default: false }
}, { timestamps: true });

productSchema.pre('save', function(next) {
  if (this.stock === 0 && this.status === 'active') this.status = 'out_of_stock';
  if (this.stock > 0 && this.status === 'out_of_stock') this.status = 'active';
  next();
});

module.exports = mongoose.model('Product', productSchema);
