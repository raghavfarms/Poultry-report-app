import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Firm from '../models/Firm.js';
import { badRequest } from '../utils/http.js';

const publicUser = (user) => ({
  id: String(user._id),
  name: user.name,
  email: user.email,
  role: user.role,
  firms: user.firms.map((firm) => String(firm._id || firm)),
});

const signToken = (user) =>
  jwt.sign({ sub: String(user._id), role: user.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

function validateAccount(body) {
  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  if (name.length < 2) throw badRequest('Name must contain at least 2 characters.');
  if (!/^\S+@\S+\.\S+$/.test(email)) throw badRequest('Enter a valid email address.');
  if (password.length < 6) throw badRequest('Password must contain at least 6 characters.');
  return { name, email, password };
}

export async function getSetupStatus(req, res) { // check if admin user exists, if not, setup is required   //  req : incoming data from client (params,query,body,etc)   //  res : response to be sent back to client   //  next : function to pass control to the next middleware in the stack
  const privilegedUserExists = Boolean(await User.exists({ role: { $in: ['admin', 'developer'] } }));
  res.json({ setupRequired: !privilegedUserExists });
}


export async function getRegistrationFirms(req, res) {  // return only active firms
  const firms = await Firm.find({ active: true }).select('name code').sort({ name: 1 }).lean(); // lean() return simple javascript object instead of mongoose document
  res.json({ firms });  //  send response to client with active firms
}

export async function setupAdmin(req, res) { // check whether admin exist or not , if admin found then return 409 conflict error  //  redirecting perform by react after reciving response 
  if (await User.exists({ role: { $in: ['admin', 'developer'] } })) {
    return res.status(409).json({ message: 'Admin setup is already complete.' });
  }


  const account = validateAccount(req.body); // it contain data send by client in request body (name,email,password,confirmPassword)  // validateAccount function check for valid data and return object with name,email,password,confirmPassword  // if data is invalid then it throw error with message and status code 400 bad request
  
  // Promise.all() Run both firm queries concurrently and wait for both results.
 const firms = await Promise.all([
  // Find the Raghav firm.
  // If it does not exist, create it using $setOnInsert.
  Firm.findOneAndUpdate(    // mongoose query method 
    { code: 'RAGHAV' },
    {
      $setOnInsert: {    // mongoose update operator 
        name: 'Raghav',
        code: 'RAGHAV'
      }
    },
    {
      upsert: true, // Create the document if no matching firm exists.
      new: true     // Return the resulting document.
    }
  ),

  // Find the Sanjana firm.
  // If it does not exist, create it using $setOnInsert.
  Firm.findOneAndUpdate(
    { code: 'SANJANA' },
    {
      $setOnInsert: {
        name: 'Sanjana',
        code: 'SANJANA'
      }
    },
    {
      upsert: true, // Create the document if no matching firm exists.
      new: true     // Return the resulting document.
    }
  )
]);

   // This code create a new admin user in MongoDB  and send login token and user data back to client in response
  const user = await User.create({
    name: account.name,  // name entered in form by user 
    email: account.email,  // email entered in form by user
    passwordHash: await bcrypt.hash(account.password, 12),   
    role: 'admin',
    firms: firms.map((firm) => firm._id),  // Take every firm from firms array and collect those for firm IDs and store in admin account 
  });
  res.status(201).json({ token: signToken(user), user: publicUser(user) });  //  res.status(201) set status code to 201 created  //  res.json() send json response to client
}


export async function register(req, res) {
  const account = validateAccount(req.body);   // validateAccount function check for valid data and return object with name,email,password,confirmPassword  // if data is invalid then it throw error with message and status code 400 bad request
  const firmIds = [...new Set((req.body.firmIds || []).map(String))]; //Get the selected firm IDs from the request(frontend ). If none were sent, use an empty array. Convert every ID into a string, remove duplicates, and return a clean array
  if (!firmIds.length) throw badRequest('Select at least one firm.');
  const firms = await Firm.find({ _id: { $in: firmIds }, active: true });
  if (firms.length !== firmIds.length) throw badRequest('One or more selected firms are invalid.');
  const user = await User.create({
    name: account.name,
    email: account.email,
    passwordHash: await bcrypt.hash(account.password, 12),
    role: 'labour',
    firms: firmIds,
  });
  res.status(201).json({ token: signToken(user), user: publicUser(user) });
}

export async function login(req, res) {
  const email = String(req.body.email || '').trim().toLowerCase();
  const user = await User.findOne({ email, active: true });
  if (!user || !(await bcrypt.compare(String(req.body.password || ''), user.passwordHash))) {
    return res.status(401).json({ message: 'Email or password is incorrect.' });
  }
  res.json({ token: signToken(user), user: publicUser(user) });
}

export function getCurrentUser(req, res) {
  res.json({ user: publicUser(req.user) });
}
