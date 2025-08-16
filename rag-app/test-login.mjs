#!/usr/bin/env node

import fetch from 'node-fetch';

async function testLogin() {
  const loginUrl = 'http://localhost:3001/auth/dev-login';
  
  try {
    // First, get the login page to get any CSRF token if needed
    console.log('Fetching login page...');
    const getResponse = await fetch(loginUrl);
    
    if (!getResponse.ok) {
      console.error('Failed to fetch login page:', getResponse.status, getResponse.statusText);
      return;
    }
    
    // Try to login with test credentials
    console.log('Attempting login with test credentials...');
    const formData = new URLSearchParams();
    formData.append('email', 'test@example.com');
    formData.append('password', 'password123');
    formData.append('redirectTo', '/app');
    
    const loginResponse = await fetch(loginUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData,
      redirect: 'manual', // Don't follow redirects automatically
    });
    
    console.log('Login response status:', loginResponse.status);
    console.log('Response headers:', loginResponse.headers.raw());
    
    if (loginResponse.status === 302 || loginResponse.status === 303) {
      const location = loginResponse.headers.get('location');
      console.log('✅ Login successful! Redirect to:', location);
      
      // Check for session cookie
      const setCookie = loginResponse.headers.get('set-cookie');
      if (setCookie) {
        console.log('Session cookie set:', setCookie.substring(0, 50) + '...');
      }
    } else {
      console.error('❌ Login failed with status:', loginResponse.status);
      const body = await loginResponse.text();
      console.log('Response body:', body.substring(0, 200));
    }
    
  } catch (error) {
    console.error('Error testing login:', error);
  }
}

testLogin();