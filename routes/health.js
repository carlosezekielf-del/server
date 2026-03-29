const express = require('express');

const router = express.Router();

router.get('/', (_, res) => {
  res.json({
    success: true,
    status: 'OK',
    message: 'Namiskii is running'
  });
});

module.exports = router;
