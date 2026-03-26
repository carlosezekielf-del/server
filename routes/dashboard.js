const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');
const { protect, adminOnly } = require('../middleware/auth');

router.get('/', protect, adminOnly, async (req, res) => {
  try {
    const [totalProducts, totalCustomers, pendingOrders, lowStock, revenueData, recentOrders, topProducts, monthlySales, platformSales] = await Promise.all([
      Product.countDocuments(),
      User.countDocuments({ role: 'customer' }),
      Order.countDocuments({ status: 'pending' }),
      Product.countDocuments({ stock: { $lte: 10, $gt: 0 } }),
      Order.aggregate([{ $match: { status: { $ne: 'cancelled' } } }, { $group: { _id: null, total: { $sum: '$totalAmount' } } }]),
      Order.find().populate('customer', 'name').sort({ createdAt: -1 }).limit(5),
      Product.find().sort({ sales: -1 }).limit(5),
      Order.aggregate([
        { $match: { status: { $ne: 'cancelled' }, createdAt: { $gte: new Date(new Date().getFullYear(), 0, 1) } } },
        { $group: { _id: { $month: '$createdAt' }, revenue: { $sum: '$totalAmount' }, orders: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ]),
      Order.aggregate([
        { $unwind: '$items' },
        { $lookup: { from: 'products', localField: 'items.product', foreignField: '_id', as: 'prod' } },
        { $unwind: '$prod' },
        { $match: { 'prod.platform': { $in: ['Own Website', 'Mobile App'] } } },
        { $group: { _id: '$prod.platform', sales: { $sum: { $multiply: ['$items.price', '$items.quantity'] } } } }
      ])
    ]);

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const salesData = months.map((name, i) => {
      const found = monthlySales.find(m => m._id === i + 1);
      return { name, sales: found?.revenue || 0, orders: found?.orders || 0 };
    });

    res.json({
      success: true,
      data: {
        stats: { totalProducts, totalCustomers, pendingOrders, lowStock, totalRevenue: revenueData[0]?.total || 0, monthlyOrders: recentOrders.length },
        recentOrders, topProducts, salesData,
        platformSales: platformSales.length
          ? platformSales.map(p => ({ name: p._id, sales: p.sales }))
          : [{ name: 'Own Website', sales: 0 }, { name: 'Mobile App', sales: 0 }]
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
