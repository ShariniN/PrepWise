// test-api.js - Run this to verify your Hugging Face API access
import axios from 'axios';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const HF_API_KEY = process.env.HUGGINGFACE_API_KEY;

const testAPI = async () => {
  try {
    console.log('Testing Hugging Face API...');
    
    // Test 1: Simple GPT-2 request
    const response = await axios.post(
      'https://api-inference.huggingface.co/models/gpt2',
      {
        inputs: "Hello, this is a test",
        parameters: { max_new_tokens: 20 }
      },
      {
        headers: {
          Authorization: `Bearer ${HF_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      }
    );

    console.log('✅ API Test Successful!');
    console.log('Response:', response.data);
    
    return true;
    
  } catch (error) {
    console.error('❌ API Test Failed:');
    console.error('Status:', error.response?.status);
    console.error('Data:', error.response?.data);
    console.error('Message:', error.message);
    
    if (error.response?.status === 401) {
      console.error('🔑 Check your HUGGINGFACE_API_KEY');
    }
    if (error.response?.status === 429) {
      console.error('⏱️ Rate limit exceeded');
    }
    if (error.response?.status === 503) {
      console.error('🔄 Model is loading, try again in a minute');
    }
    
    return false;
  }
};

// Run the test
testAPI();