import express, { Request, Response } from 'express';
import { createServer } from 'http';

const app = express();
const httpServer = createServer(app);



app.use(express.json());


app.get('/', (req: Request, res: Response) => {
  res.status(200).send('Welcome to the worknoon chat server');
});

const PORT = 9000;
httpServer.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
