const mongoose = require('mongoose');
const User = require('./server/models/User');

async function checkUser() {
  try {
    await mongoose.connect('mongodb://localhost:27017/myai');
    console.log('Connected to MongoDB');
    
    const user = await User.findOne({email: 'admin@myai.com'}).select('+password');
    
    if (user) {
      console.log('User found:');
      console.log('- Email:', user.email);
      console.log('- Username:', user.username);
      console.log('- Has password:', !!user.password);
      console.log('- Is active:', user.isActive);
      console.log('- Role:', user.role);
      
      // Test password comparison
      const isMatch = await user.comparePassword('Admin123!@#');
      console.log('- Password matches Admin123!@#:', isMatch);
    } else {
      console.log('User not found');
    }
    
    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkUser();