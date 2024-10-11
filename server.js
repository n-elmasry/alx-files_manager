import express from 'express';
import routes from './routes/index';
import { dbClient } from './utils/db';

const app = express();
const port = process.env.PORT || 5000;

app.use(express.json());

app.use('/', routes);

app.listen(port, () => {

});
