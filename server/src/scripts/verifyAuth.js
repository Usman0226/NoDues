import 'dotenv/config';
import axios from 'axios';

const BASE_URL = 'http://localhost:5000/api';

const runTests = async () => {
  console.log('--- Starting Auth System Verification (Backend) ---\n');

  try {
    // 1. ADMIN LOGIN
    console.log('[Test 1] Admin Login...');
    const adminLogin = await axios.post(`${BASE_URL}/auth/login`, {
      email: 'admin@csd.com',
      password: 'Admin@123'
    });
    console.log('✓ Admin Login Success');
    const adminCookie = adminLogin.headers['set-cookie'];

    // 2. VERIFY GET ME (ADMIN)
    console.log('[Test 2] Verify Admin Profile...');
    const adminMe = await axios.get(`${BASE_URL}/auth/me`, {
      headers: { Cookie: adminCookie }
    });
    if (adminMe.data.data.role !== 'admin') throw new Error('Role mismatch for Admin');
    console.log('✓ Admin Role Verified');

    // 3. STUDENT LOGIN
    console.log('[Test 3] Student Login...');
    const studentLogin = await axios.post(`${BASE_URL}/auth/student-login`, {
      rollNo: '22CS001'
    });
    console.log('✓ Student Login Success');
    const studentCookie = studentLogin.headers['set-cookie'];

    // 4. VERIFY GET ME (STUDENT)
    console.log('[Test 4] Verify Student Profile...');
    const studentMe = await axios.get(`${BASE_URL}/auth/me`, {
      headers: { Cookie: studentCookie }
    });
    if (studentMe.data.data.role !== 'student') throw new Error('Role mismatch for Student');
    console.log('✓ Student Role Verified');

    // 5. RBAC CHECK (STUDENT PROHIBITED ACCESS)
    console.log('[Test 5] RBAC Check: Student accessing Admin route (/api/departments)...');
    try {
      await axios.get(`${BASE_URL}/departments`, {
        headers: { Cookie: studentCookie }
      });
      throw new Error('Exploit Found: Student accessed admin route!');
    } catch (err) {
      if (err.response?.status === 403) {
        console.log('✓ Student access denied as expected (403)');
      } else {
        throw new Error(`Unexpected error status: ${err.response?.status}`);
      }
    }

    // 6. HOD LOGIN & DEPARTMENT SCOPE
    console.log('[Test 6] HOD Login...');
    const hodLogin = await axios.post(`${BASE_URL}/auth/login`, {
      email: 'hod@test.com',
      password: 'Pass@123'
    });
    console.log('✓ HOD Login Success');
    const hodCookie = hodLogin.headers['set-cookie'];

    // 7. FACULTY LOGIN
    console.log('[Test 7] Faculty Login...');
    const facultyLogin = await axios.post(`${BASE_URL}/auth/login`, {
      email: 'faculty@test.com',
      password: 'Pass@123'
    });
    console.log('✓ Faculty Login Success');
    const facultyCookie = facultyLogin.headers['set-cookie'];

    // 8. LOGOUT
    console.log('[Test 8] Logout Testing...');
    await axios.post(`${BASE_URL}/auth/logout`, {}, {
      headers: { Cookie: adminCookie }
    });
    console.log('✓ Logout Success');

    console.log('\n--- All Backend Auth Tests Passed Successfully! ---');
    process.exit(0);
  } catch (err) {
    console.error('\n✖ TEST FAILED');
    console.error(err.message);
    if (err.response) {
      console.error('Response Data:', JSON.stringify(err.response.data, null, 2));
    }
    process.exit(1);
  }
};

runTests();
