const express = require('express');
const app = express();
const port = 9000;

app.get('/', (req, res) => {
  res.send('Welcome to the worknoon chat server');
}); 
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});