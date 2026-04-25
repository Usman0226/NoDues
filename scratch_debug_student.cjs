const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, 'server', '.env') });

const studentSchema = require('./server/src/models/Student').default.schema;
const Student = mongoose.model('Student', studentSchema);

async function run() {
  try {
    const uri = process.env.MONGODB_URI || process.env.MONGODB_URI;
    console.log('Connecting to:', uri ? 'URI defined' : 'URI UNDEFINED');
    await mongoose.connect(process.env.MONGODB_URI);
    
    // Find students with rollNo starting with CSD-E or something similar
    // The user said "student(CSD-E)", maybe rollNo is CSD-E or name?
    const students = await Student.find({ 
      'coCurricular.0': { $exists: true }
    }).limit(10);
    
    console.log('Found students with co-curriculars:', students.length);
    students.forEach(s => {
      console.log('---');
      console.log('Name:', s.name);
      console.log('Roll:', s.rollNo);
      console.log('Year:', s.yearOfStudy);
      console.log('Co-curriculars Count:', s.coCurricular.length);
      console.log('Co-curriculars:', s.coCurricular.map(c => c.itemCode).join(', '));
    });
    
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}

run();
