// scripts/seedAdmin.js
import mongoose from 'mongoose';
import Admin from '../models/AdminModel.js';
import 'dotenv/config';

const seedAdmin = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Check if admin already exists
    const existingAdmin = await Admin.findOne({ email: 'admin@company.com' });
    if (existingAdmin) {
      console.log('Admin already exists');
      process.exit(0);
    }

    // Create admin user
    const adminData = {
      name: 'Admin User',
      email: 'admin@company.com',
      password: 'Admin@123456' // Change this to your desired password
    };

    const admin = new Admin(adminData);
    await admin.save();
    
    console.log('Admin user created successfully:');
    console.log('Email: admin@company.com');
    console.log('Password: Admin@123456');
    console.log('Please change the password after first login!');
    
    process.exit(0);
  } catch (error) {
    console.error('Error seeding admin:', error);
    process.exit(1);
  }
};

seedAdmin();