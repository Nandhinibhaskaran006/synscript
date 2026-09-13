const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const GitHubStrategy = require('passport-github2').Strategy;
const User = require('../models/User');

// Helper to generate a clean, unique username
async function generateUniqueUsername(preferredName) {
  let base = (preferredName || 'user').replace(/[^a-zA-Z0-9_]/g, '').trim().toLowerCase();
  if (base.length < 3) {
    base = 'user_' + Math.floor(1000 + Math.random() * 9000);
  }
  let username = base;
  let counter = 1;
  while (await User.findOne({ username })) {
    username = `${base}${Math.floor(100 + Math.random() * 900)}${counter}`;
    counter++;
  }
  return username;
}

const backendUrl = process.env.BACKEND_URL || 'http://localhost:5000';

// ── Google OAuth Strategy ──────────────────────────────────────────
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: `${backendUrl}/api/auth/google/callback`,
        scope: ['profile', 'email'],
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const googleId = profile.id;
          const email = profile.emails && profile.emails[0] ? profile.emails[0].value.toLowerCase() : null;
          const avatar = profile.photos && profile.photos[0] ? profile.photos[0].value : '';

          // 1. Check if user exists with googleId
          let user = await User.findOne({ googleId });
          if (user) {
            // Update avatar if currently empty
            if (!user.avatar && avatar) {
              user.avatar = avatar;
              await user.save();
            }
            return done(null, user);
          }

          // 2. Check if user exists with the same email
          if (email) {
            user = await User.findOne({ email });
            if (user) {
              user.googleId = googleId;
              if (!user.avatar && avatar) {
                user.avatar = avatar;
              }
              await user.save();
              return done(null, user);
            }
          }

          // 3. Create a new user
          const username = await generateUniqueUsername(profile.displayName || (email ? email.split('@')[0] : 'user'));
          const newUser = await User.create({
            username,
            email: email || `${googleId}@google.synscript.dev`,
            googleId,
            avatar,
          });

          return done(null, newUser);
        } catch (err) {
          console.error('Google OAuth error:', err);
          return done(err, null);
        }
      }
    )
  );
} else {
  console.warn('⚠️ Google OAuth credentials missing (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET). Google strategy not registered.');
}

// ── GitHub OAuth Strategy ──────────────────────────────────────────
if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  passport.use(
    new GitHubStrategy(
      {
        clientID: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
        callbackURL: `${backendUrl}/api/auth/github/callback`,
        scope: ['user:email'],
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const githubId = profile.id;
          const email =
            (profile.emails && profile.emails[0] ? profile.emails[0].value.toLowerCase() : null) ||
            (profile._json && profile._json.email ? profile._json.email.toLowerCase() : null);
          const avatar = profile.photos && profile.photos[0] ? profile.photos[0].value : '';
          const githubUrl = profile.profileUrl || `https://github.com/${profile.username}`;

          // 1. Check if user exists with githubId
          let user = await User.findOne({ githubId });
          if (user) {
            let updated = false;
            if (!user.avatar && avatar) {
              user.avatar = avatar;
              updated = true;
            }
            if (!user.githubUrl && githubUrl) {
              user.githubUrl = githubUrl;
              updated = true;
            }
            if (updated) {
              await user.save();
            }
            return done(null, user);
          }

          // 2. Check if user exists with the same email
          if (email) {
            user = await User.findOne({ email });
            if (user) {
              user.githubId = githubId;
              if (!user.avatar && avatar) {
                user.avatar = avatar;
              }
              if (!user.githubUrl && githubUrl) {
                user.githubUrl = githubUrl;
              }
              await user.save();
              return done(null, user);
            }
          }

          // 3. Create a new user
          const username = await generateUniqueUsername(profile.username || profile.displayName || (email ? email.split('@')[0] : 'user'));
          const newUser = await User.create({
            username,
            email: email || `${githubId}@github.synscript.dev`,
            githubId,
            avatar,
            githubUrl,
          });

          return done(null, newUser);
        } catch (err) {
          console.error('GitHub OAuth error:', err);
          return done(err, null);
        }
      }
    )
  );
} else {
  console.warn('⚠️ GitHub OAuth credentials missing (GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET). GitHub strategy not registered.');
}

module.exports = passport;
