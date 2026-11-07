import 'dotenv/config';
import connectDB from './config/mongodb.js';
import app from './app.js';

// Fail at startup rather than signing tokens with an undefined secret
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
  console.error('JWT_SECRET must be set to a random value of at least 16 characters.');
  process.exit(1);
}

const port = process.env.PORT || 4000;

await connectDB();

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
