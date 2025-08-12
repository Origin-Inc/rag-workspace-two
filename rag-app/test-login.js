// Test login script
async function testLogin() {
  const formData = new FormData();
  // Use the email we registered earlier
  formData.append('email', 'test2@example.com');
  formData.append('password', 'password123');

  try {
    const response = await fetch('http://localhost:3001/auth/login-simple', {
      method: 'POST',
      body: formData,
      redirect: 'manual' // Don't follow redirects automatically
    });

    console.log('Status:', response.status);
    console.log('Headers:', [...response.headers.entries()]);
    
    if (response.status === 303 || response.status === 302 || response.status === 200) {
      console.log('Success! Redirected to:', response.headers.get('location'));
      const setCookie = response.headers.get('set-cookie');
      if (setCookie) {
        console.log('Session cookie set:', setCookie.substring(0, 50) + '...');
      }
    } else {
      const text = await response.text();
      console.log('Response:', text.substring(0, 500));
    }
  } catch (error) {
    console.error('Request failed:', error);
  }
}

testLogin();