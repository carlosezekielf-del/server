const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const Product = require('../models/Product');
const { protect, adminOnly } = require('../middleware/auth');

// CUSTOMER - place order
router.post('/', protect, async (req, res) => {
  try {
    const { items, shippingAddress, notes } = req.body;
    if (!items || items.length === 0) return res.status(400).json({ success: false, message: 'Order must have items' });
    if (!shippingAddress?.street || !shippingAddress?.city) return res.status(400).json({ success: false, message: 'Shipping address required' });

    let totalAmount = 0;
    const orderItems = [];
    for (const item of items) {
      const product = await Product.findById(item.product);
      if (!product) return res.status(404).json({ success: false, message: `Product not found` });
      if (product.stock < item.quantity) return res.status(400).json({ success: false, message: `Not enough stock for ${product.name}` });
      orderItems.push({ product: product._id, name: product.name, price: product.price, quantity: item.quantity, image: product.image });
      totalAmount += product.price * item.quantity;
      await Product.findByIdAndUpdate(product._id, { $inc: { stock: -item.quantity, sales: item.quantity } });
    }

    const order = await Order.create({
      customer: req.user._id,
      items: orderItems,
      totalAmount,
      shippingAddress,
      paymentMethod: 'Cash on Delivery',
      notes
    });
    res.status(201).json({ success: true, data: order });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// CUSTOMER - my orders
router.get('/my', protect, async (req, res) => {
  try {
    const orders = await Order.find({ customer: req.user._id }).sort({ createdAt: -1 });
    res.json({ success: true, data: orders });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ADMIN - all orders
router.get('/', protect, adminOnly, async (req, res) => {
  try {
    const { page = 1, limit = 10, status, search } = req.query;
    const query = {};
    if (status) query.status = status;
    if (search) query.$or = [{ orderNumber: { $regex: search, $options: 'i' } }];
    const total = await Order.countDocuments(query);
    const orders = await Order.find(query).populate('customer', 'name email').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(Number(limit));
    res.json({ success: true, data: orders, pagination: { total, page: Number(page), pages: Math.ceil(total / limit) } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ADMIN - update status
router.put('/:id/status', protect, adminOnly, async (req, res) => {
  try {
    const { status } = req.body;
    const valid = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];
    if (!valid.includes(status)) return res.status(400).json({ success: false, message: 'Invalid status' });
    const order = await Order.findByIdAndUpdate(req.params.id, { status }, { new: true }).populate('customer', 'name email');
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    res.json({ success: true, data: order });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ADMIN - get all customers
router.get('/customers', protect, adminOnly, async (req, res) => {
  try {
    const User = require('../models/User');
    const customers = await User.find({ role: 'customer' }).sort({ createdAt: -1 });
    res.json({ success: true, data: customers });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
