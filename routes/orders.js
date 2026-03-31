const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');
const { protect, adminOnly } = require('../middleware/auth');

const normalizePhone = (phone) => String(phone || '').replace(/\D/g, '');
const normalizeZipCode = (zipCode) => String(zipCode || '').replace(/\D/g, '').slice(0, 4);
const normalizeShippingAddress = (shippingAddress = {}) => ({
  street: String(shippingAddress.street || '').trim(),
  city: String(shippingAddress.city || '').trim(),
  zipCode: normalizeZipCode(shippingAddress.zipCode),
  country: String(shippingAddress.country || 'Philippines').trim() || 'Philippines',
  phone: normalizePhone(shippingAddress.phone)
});

// CUSTOMER - place order
router.post('/', protect, async (req, res) => {
  try {
    const { items, shippingAddress, notes } = req.body;
    if (!items || items.length === 0) return res.status(400).json({ success: false, message: 'Order must have items' });

    const normalizedAddress = normalizeShippingAddress(shippingAddress);
    if (!String(req.user?.name || '').trim()) {
      return res.status(400).json({ success: false, message: 'Complete your profile name before placing an order.' });
    }
    if (!normalizedAddress.street || !normalizedAddress.city || !normalizedAddress.country) {
      return res.status(400).json({ success: false, message: 'Complete your full shipping address before placing an order.' });
    }
    if (!/^\d{4}$/.test(normalizedAddress.zipCode)) {
      return res.status(400).json({ success: false, message: 'Zip code must be exactly 4 digits.' });
    }
    if (!/^09\d{9}$/.test(normalizedAddress.phone)) {
      return res.status(400).json({ success: false, message: 'Phone number is required (11 digits starting with 09).' });
    }

    const normalizedProfileAddress = [
      normalizedAddress.street,
      normalizedAddress.city,
      normalizedAddress.zipCode,
      normalizedAddress.country
    ].join(', ');

    if (req.user.phone !== normalizedAddress.phone || req.user.address !== normalizedProfileAddress) {
      await User.findByIdAndUpdate(req.user._id, {
        phone: normalizedAddress.phone,
        address: normalizedProfileAddress
      });
      req.user.phone = normalizedAddress.phone;
      req.user.address = normalizedProfileAddress;
    }

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
      shippingAddress: normalizedAddress,
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
