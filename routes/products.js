const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const { protect, adminOnly } = require('../middleware/auth');

// PUBLIC - for customer store
router.get('/public', async (req, res) => {
  try {
    const { search, category, sort = 'newest' } = req.query;
    const query = { status: 'active' };
    if (search) query.name = { $regex: search, $options: 'i' };
    if (category) query.category = category;
    const sortMap = {
      newest: { createdAt: -1 },
      oldest: { createdAt: 1 },
      price_asc: { price: 1 },
      price_desc: { price: -1 },
      popular: { sales: -1 }
    };
    const products = await Product.find(query).sort(sortMap[sort] || { createdAt: -1 });
    res.json({ success: true, data: products });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ADMIN - get all products
router.get('/', protect, adminOnly, async (req, res) => {
  try {
    const { page = 1, limit = 10, search, category, status } = req.query;
    const query = {};
    if (search) query.name = { $regex: search, $options: 'i' };
    if (category) query.category = category;
    if (status) query.status = status;
    const total = await Product.countDocuments(query);
    const products = await Product.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(Number(limit));
    res.json({ success: true, data: products, pagination: { total, page: Number(page), pages: Math.ceil(total / limit) } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/', protect, adminOnly, async (req, res) => {
  try {
    const { name, price, stock, category } = req.body;
    if (!name || name.length < 2) return res.status(400).json({ success: false, message: 'Name must be at least 2 characters' });
    if (price == null || isNaN(price) || price <= 0) return res.status(400).json({ success: false, message: 'Price must be greater than 0' });
    if (stock == null || isNaN(stock) || stock < 0) return res.status(400).json({ success: false, message: 'Valid stock required' });
    if (!category) return res.status(400).json({ success: false, message: 'Category required' });
    const product = await Product.create(req.body);
    res.status(201).json({ success: true, data: product });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/:id', protect, adminOnly, async (req, res) => {
  try {
    const product = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
    res.json({ success: true, data: product });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/:id', protect, adminOnly, async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
    res.json({ success: true, message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
