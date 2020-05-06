const functions = require('firebase-functions');
//Axios for web GET POST
const axios = require("axios");


let url;


// // Mail Init
// const nodemailer = require('nodemailer');
// const cors = require('cors')({origin: true});

// let transporter = nodemailer.createTransport({
//     service: 'gmail',
//     auth: {
//         user: functions.config().keys.gmail.user,
//         pass: functions.config().keys.gmail.pass
//     }
// });


// The environment can be either sandbox or live
const environment = functions.config().keys.environment;

// the groupName is the name of the group we want to use
const groupName = functions.config().keys.settleup.groupname;

let groupId;





// Stripe Init
const stripe = require('stripe')(functions.config().keys.webhooks);

const endpointSecret = functions.config().keys.signing;




// SettleUp Init
// Firebase App (the core Firebase SDK) is always required and
// must be listed before other Firebase SDKs
var firebase = require("firebase/app");

// Add the Firebase products that you want to use
require("firebase/auth");

var firebaseConfig = {
  apiKey: functions.config().keys.settleup.sandbox.apikey,
  authDomain: `settle-up-${environment}.firebaseapp.com`,
  databaseURL: `https://settle-up-${environment}.firebaseio.com`,
  projectId: `settle-up-${environment}`,
  storageBucket: `settle-up-${environment}.appspot.com`,
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

let user;

let idtoken;

firebase.auth().signInWithEmailAndPassword(
  functions.config().keys.settleup.sandbox.email, 
  functions.config().keys.settleup.sandbox.password).catch(function(error) {
  // Handle Errors here.
  var errorCode = error.code;
  var errorMessage = error.message;
  console.log(error);
  // ...
});

firebase.auth().onAuthStateChanged(function(isUser) {
  if (isUser) {
    // User is signed in.
    user = firebase.auth().currentUser;
    console.log(user);
  } else {
    // No user is signed in.
    console.log('User is not signed in');
  }
});





async function getUserGroups() {
  url = `https://settle-up-${environment}.firebaseio.com/userGroups/${user.uid}.json?auth=${idtoken}`;
  try {
    const response = await axios.get(url);
    const data = response.data;
    // console.log(Object.keys(response));
    console.log(data);
    return data;
  } catch (error) {
    console.error(error);
    return null;
  }
}


async function getGroupDetails(groupId) {
  url = `https://settle-up-${environment}.firebaseio.com/groups/${groupId}.json?auth=${idtoken}`;
  try {
    const response = await axios.get(url);
    const data = response.data;
    // console.log(Object.keys(response));
    console.log(data);
    return data;
  } catch (error) {
    console.error(error);
    return null;
  }
}


async function findGroupId(userGroups) {
  for (var groupId in userGroups) {
    if (groupName == (await getGroupDetails(groupId)).name) {
      return groupId;
    }
  }
  return null;
}


async function getGroupMembers() {
  url = `https://settle-up-${environment}.firebaseio.com/members/${groupId}.json?auth=${idtoken}`;
  try {
    const response = await axios.get(url);
    const data = response.data;
    // console.log(Object.keys(response));
    console.log(data);
    return data;
  } catch (error) {
    console.error(error);
    return null;
  }
}

async function findMemberId(memberName) {
  const groupMembers = await getGroupMembers();
  for (var memberId in groupMembers) {
    if (memberName == groupMembers[memberId].name) {
      return memberId;
    }
  }
  return null;
}





// // Create and Deploy Your First Cloud Functions
// // https://firebase.google.com/docs/functions/write-firebase-functions
//
// exports.helloWorld = functions.https.onRequest((request, response) => {
//  response.send("Hello from Firebase!");
// });


exports.events = functions.https.onRequest(async (request, response) => {
  idtoken = await user.getIdToken();
  // user.getIdToken().then(function(realIdToken) {  // <------ Check this line
  //   idtoken = realIdToken
  //   console.log(realIdToken); // It shows the Firebase token now
  // });
  console.log(`idtoken: ${idtoken}`);

  const sig = request.headers['stripe-signature'];

  let event, buyerId;

  try {
    // event is the stripe webhook, containing the transaction/user
    event = stripe.webhooks.constructEvent(request.rawBody, sig, endpointSecret);
  }
  catch (err) {
    response.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  switch (event.type) {
  case 'payment_intent.succeeded':
    const paymentIntent = event.data.object;
    console.log('PaymentIntent was successful!');
    break;
  case 'payment_method.attached':
    const paymentMethod = event.data.object;
    console.log('PaymentMethod was attached to a Customer!');
    break;
  case 'charge.succeeded':
    // get the user groups
    const userGroups = await getUserGroups();
    // get the group id with name groupName, to use and add the transaction.
    groupId = await findGroupId(userGroups);
    // get the stripe transaction
    const stripeTrans = event.data.object;
    // get the id of the buyer by matching the name with the name on Settle Up
    buyerId = await findMemberId(stripeTrans.billing_details.name);
    // await createTransactionFrom(event);
    
    console.log(buyerId);

  // ... handle other event types
  default:
    console.log(event);

    // Unexpected event type
    // return response.status(400).end();
  }

  // Return a response to acknowledge receipt of the event
  return response.json({received: true, groupId});



  response.send("Endpoint for Stripe Webhooks!");
});
