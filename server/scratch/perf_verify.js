import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import 'dotenv/config';

// Simulate the login logic to measure performance gain
const measurePerformance = async () => {
    const password = 'TestPassword123';
    
    console.log('--- Phase 2 Performance Verification ---');

    // 1. Measure Bcrypt 10 rounds (New Standard)
    const salt10 = await bcrypt.genSalt(10);
    const hash10 = await bcrypt.hash(password, salt10);
    
    let start = Date.now();
    await bcrypt.compare(password, hash10);
    let duration10 = Date.now() - start;
    console.log(`Bcrypt 10 rounds: ${duration10}ms (Target: <100ms)`);

    // 2. Measure Bcrypt 12 rounds (Old Standard)
    const salt12 = await bcrypt.genSalt(12);
    const hash12 = await bcrypt.hash(password, salt12);
    
    start = Date.now();
    await bcrypt.compare(password, hash12);
    let duration12 = Date.now() - start;
    console.log(`Bcrypt 12 rounds: ${duration12}ms (Reference baseline)`);

    console.log(`\nEstimated Savings from Bcrypt alone: ${duration12 - duration10}ms`);

    // 3. Simulate Parallel vs Sequential Meta-Processing
    // (Simulating a DB round trip as a 80ms promise)
    const dbSim = () => new Promise(resolve => setTimeout(() => resolve('Dept Name'), 80));

    // Sequential (Old)
    start = Date.now();
    await bcrypt.compare(password, hash10);
    await dbSim();
    let durationSeq = Date.now() - start;

    // Parallel (New Phase 2)
    start = Date.now();
    await Promise.all([
        bcrypt.compare(password, hash10),
        dbSim()
    ]);
    let durationPar = Date.now() - start;

    console.log(`\nLogic Latency (Bcrypt 10 + Metadata Fetch):`);
    console.log(`- Sequential: ${durationSeq}ms`);
    console.log(`- Parallel:   ${durationPar}ms`);
    console.log(`- Logic Savings: ${durationSeq - durationPar}ms`);

    const totalSystemLatent = duration12 + (durationSeq - duration10); // Approximation of old way
    const currentTotal = durationPar;
    
    console.log(`\nEstimated Total Login Latency reduction:`);
    console.log(`- Baseline (Est): ~${totalSystemLatent}ms`);
    console.log(`- Current (Est):  ~${currentTotal}ms`);
    console.log(`- Improvement:   ~${totalSystemLatent - currentTotal}ms (${Math.round((1 - currentTotal/totalSystemLatent)*100)}% faster)`);

    process.exit(0);
};

measurePerformance();
