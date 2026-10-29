import 'dotenv/config';import express from 'express';import helmet from 'helmet';import cookieParser from 'cookie-parser';import rateLimit from 'express-rate-limit';import {pool} from './db.js';import authRoutes from './routes/auth.js';import tasks from './routes/tasks.js';import dashboard from './routes/dashboard.js';
const app=express();app.set('trust proxy',1);app.use(helmet());app.use(express.json({limit:'1mb'}));app.use(cookieParser());app.use(rateLimit({windowMs:15*60*1000,limit:300,standardHeaders:true,legacyHeaders:false}));
app.get('/api/v1/health',async(_req,res)=>{try{await pool.query('SELECT 1');res.json({status:'ok',database:'connected'});}catch{res.status(503).json({status:'unavailable',database:'unavailable'});}});
app.use('/api/v1/auth',authRoutes);app.use('/api/v1/tasks',tasks);app.use('/api/v1/dashboard',dashboard);
app.use((err,_req,res,_next)=>{console.error(err);res.status(500).json({error:'Something went wrong. Please try again.'});});
const port=Number(process.env.PORT||4000);app.listen(port,'0.0.0.0',()=>console.log(`TaskMate API listening on ${port}`));

