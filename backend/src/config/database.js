const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Conexión a MongoDB establecida');
  } catch (error) {
    console.error('❌ Error conectando a MongoDB:', error);
    process.exit(1); // Forzar salida si falla la conexión
  }
};

module.exports = connectDB;
