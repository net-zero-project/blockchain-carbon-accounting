import express, { Application } from 'express';
import bodyParser from 'body-parser';
import { fetchIpfs } from './app/controllers/controller';
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({path: path.resolve(__dirname + '../.env')});

// import router
import { router as keyRouter } from './app/routers/router';

const app: Application = express();
const PORT: number | string = process.env.REST_API_PORT || 5000;

// middleware setting
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));

app.post('/issue', keyRouter);
app.get('/ipfs', fetchIpfs);

app.listen(PORT, () => {
    console.log(`Server is listening on ${PORT}`);
});