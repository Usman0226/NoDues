import mongoose from 'mongoose';
import NodueBatch from '../models/NodueBatch.js';
import { config } from 'dotenv';
import path from 'path'
import {fileURLToPath} from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

config({path:path.resolve(__dirname,'../.env')})


const deleteInActive = async ()=>{
    try{
        await mongoose.connect(process.env.MONGODB_URI);
        const activeBatch = await NodueBatch.find({status: 'active'})
        console.log(activeBatch)

    }catch(err){
        console.log(err);
    }
}


deleteInActive();  