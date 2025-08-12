// Test registration script
async function testRegistration() {
  const formData = new FormData();
  formData.append('email', 'test2@example.com');
  formData.append('password', 'password123');

  try {
    const response = await fetch('http://localhost:3001/auth/register-simple', {
      method: 'POST',
      body: formData,
    });

    console.log('Status:', response.status);
    console.log('Headers:', [...response.headers.entries()]);
    
    if (!response.ok) {
      const text = await response.text();
      console.log('Error response:', text);
    } else {
      console.log('Success! Redirected to:', response.headers.get('location'));
    }
  } catch (error) {
    console.error('Request failed:', error);
  }
}

testRegistration();