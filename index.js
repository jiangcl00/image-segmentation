const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });
const Canvas = require('canvas');
const Jimp = require('jimp');
const path = require('path');
const dotenv = require('dotenv');
const session = require('express-session');
dotenv.config();

const client_ID = process.env.GOOGLE_CLIENT_ID;
const client_Secret = process.env.GOOGLE_CLIENT_SECRET;
const secret_Key = process.env.SECRET_KEY;

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(session({
  secret: secret_Key,
  resave: false,
  saveUninitialized: true
}));

app.use(passport.initialize());
app.use(passport.session());

// Connect to MongoDB
mongoose.connect('mongodb://127.0.0.1:27017/image-segmentation', { useNewUrlParser: true, useUnifiedTopology: true });

// User schema for mongodb
const UserSchema = new mongoose.Schema({
  email: String,
  password: String,
  googleId: String,
});
const User = mongoose.model('User', UserSchema);

const ImageSchema = new mongoose.Schema({
  path: String,
  label: String,
});
const Image = mongoose.model('Image', ImageSchema);

const MaskSchema = new mongoose.Schema({
  imageId: mongoose.Types.ObjectId,
  label: String,
  data: Buffer,
});
const Mask = mongoose.model('Mask', MaskSchema);

passport.use(new GoogleStrategy({
  clientID: client_ID,
  clientSecret: client_Secret,
  callbackURL: 'http://localhost:3000/auth/google/callback'
},
async (accessToken, refreshToken, profile, done) => {
  let user = await User.findOne({ googleId: profile.id });
  if (!user) {
    user = new User({ email: profile.emails[0].value, googleId: profile.id });
    await user.save();
  }
  done(null, user);
}));

passport.serializeUser((user, done) => {
  done(null, user._id);
});
passport.deserializeUser(async (id, done) => {
  const user = await User.findById(id);
  done(null, user);
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'login.html'));
});


app.get('/signup', (req, res) => {
  res.sendFile(path.join(__dirname, 'signup.html'));
});


app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
app.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/login' }), (req, res) => {
  res.redirect('/segment');
});



app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const existingUser = await User.findOne({ email });
  if (!existingUser) {
    res.redirect('/login');
  } else if (password !=existingUser.password) {
    res.redirect('/login');
  } else {
    req.session.user = existingUser;
    res.redirect('/segment');
  }
});

app.post('/signup', async (req, res) => {
  const { email, password } = req.body;

  const existingUser = await User.findOne({ email });
  if (existingUser) {
    res.redirect('/signup');
  } else {
    const hashedPassword = password;
    //const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ email, password: hashedPassword });
    await user.save();

    res.redirect('/login');
  }
});
app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
app.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/login' }), (req, res) => {
  res.redirect('/segment');
});

app.get('/segment', (req, res) => {
  res.sendFile(__dirname + '/segment.html');
});
app.post('/segment', async (req, res) => {
  // Get user ID and images from request body
  const { userId, images } = req.body;

  // Loop through images and get segmentations
  const segmentations = [];
  for (let i = 0; i < images.length; i++) {
    const image = images[i];
    const imagePath = `uploads/${image.name}`;
    await image.mv(imagePath);

    // Display image to user and ask for segmentation information
    const segmentation = await getManualSegmentation(imagePath);
    segmentations.push(segmentation);

    // Add segmentation to user's data in MongoDB
    const user = await User.findById(userId);
    user.segmentations.push({ image: imagePath, segmentation });
    await user.save();
  }

  res.status(200).json({ message: 'Segmentations saved successfully', segmentations });
});
async function getManualSegmentation(imagePath) {
  // Display image to user and ask for segmentation information
  return { x: 10, y: 10, width: 50, height: 50 };
}
app.listen(3000, () => {
  console.log('Server started on port 3000');
});