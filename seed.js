require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const Product = require('./models/Product');
const Order = require('./models/Order');

const PRODUCTS = [
  { name: 'Naruto Uzumaki Figure - Premium', price: 1850, stock: 24, category: 'Action Figures', platform: 'Own Website', sales: 52, featured: true, description: 'High-quality 30cm Naruto figure with detailed painting and accessories.' },
  { name: 'Goku Ultra Instinct Statue', price: 3200, stock: 8, category: 'Statues', platform: 'Facebook', sales: 31, featured: true, description: 'Stunning resin statue of Goku in Ultra Instinct form, 40cm tall.' },
  { name: 'One Piece Luffy Gear 5 Figure', price: 2400, stock: 15, category: 'Action Figures', platform: 'Own Website', sales: 44, description: 'Luffy Gear 5 with Nika form, dynamic pose, 25cm.' },
  { name: 'Attack on Titan Eren Yeager', price: 1650, stock: 20, category: 'Action Figures', platform: 'Own Website', sales: 28, description: 'Eren Yeager in scout regiment uniform, 20cm.' },
  { name: 'Demon Slayer Tanjiro Model Kit', price: 890, stock: 35, category: 'Model Kits', platform: 'Own Website', sales: 67, description: 'Snap-fit model kit, no glue needed, 15cm.' },
  { name: 'Pikachu Plush XL', price: 650, stock: 50, category: 'Plushies', platform: 'Facebook', sales: 120, description: 'Super soft 40cm Pikachu plush toy.' },
  { name: 'Dragon Ball Z Trading Cards Set', price: 450, stock: 100, category: 'Trading Cards', platform: 'Own Website', sales: 85, description: 'Set of 50 holographic DBZ trading cards.' },
  { name: 'Chainsaw Man Denji Figure', price: 1950, stock: 3, category: 'Action Figures', platform: 'Own Website', sales: 19, description: 'Denji with chainsaw blades extended, 22cm.' },
  { name: 'My Hero Academia Deku Statue', price: 2800, stock: 12, category: 'Statues', platform: 'Facebook', sales: 23, description: 'Full Cowling Deku in action pose, 35cm resin statue.' },
  { name: 'Jujutsu Kaisen Gojo Figure', price: 2100, stock: 0, category: 'Action Figures', platform: 'Own Website', sales: 38, status: 'out_of_stock', description: 'Satoru Gojo with infinity domain expansion effect, 28cm.' },
];

async function seed() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    await User.deleteMany({});
    await Product.deleteMany({});
    await Order.deleteMany({});
    console.log('Cleared existing data');

    const admin = await User.create({ name: 'Admin Namiskii', email: 'admin@namiskii.com', password: 'admin123', role: 'admin' });
    console.log('✅ Admin created: admin@namiskii.com / admin123');

    const customer = await User.create({ name: 'Juan dela Cruz', email: 'customer@test.com', password: 'test123', role: 'customer', phone: '09171234567', address: 'Manila, Philippines' });
    console.log('✅ Customer created: customer@test.com / test123');

    const products = await Product.insertMany(PRODUCTS);
    console.log(`✅ ${products.length} products created`);

    const months = [0, 1, 2, 3, 4, 5];
    for (const month of months) {
      for (let i = 0; i < Math.floor(Math.random() * 10 + 5); i++) {
        const item = products[Math.floor(Math.random() * products.length)];
        const qty = Math.floor(Math.random() * 3) + 1;
        const date = new Date(2024, month, Math.floor(Math.random() * 28) + 1);
        await Order.create({
          customer: customer._id,
          items: [{ product: item._id, name: item.name, price: item.price, quantity: qty, image: item.image }],
          totalAmount: item.price * qty,
          status: ['pending', 'processing', 'shipped', 'delivered'][Math.floor(Math.random() * 4)],
          shippingAddress: { street: '123 Rizal St', city: 'Manila', zipCode: '1000', country: 'Philippines' },
          paymentMethod: 'Cash on Delivery',
          createdAt: date
        });
      }
    }
    console.log('✅ Orders created');
    console.log('\n Seed complete!');
    process.exit(0);
  } catch (err) {
    console.error('Seed error:', err);
    process.exit(1);
  }
}

seed();
