const authRouter= require('./routes/auth.routes');
const accountRouter = require('./routes/account.routes');
const express = require('express');
const cookierParser = require('cookie-parser');
const app = express();

app.use(express.json());
app.use(cookierParser());
app.use ("/api/auth" , authRouter)
app.use ("/api/account" , accountRouter)
module.exports = app;
