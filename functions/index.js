const functions = require('firebase-functions');



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
  authDomain: "settle-up-sandbox.firebaseapp.com",
  databaseURL: "https://settle-up-sandbox.firebaseio.com",
  projectId: "settle-up-sandbox",
  storageBucket: "settle-up-sandbox.appspot.com",
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

var idtoken = functions.config().keys.settleup.sandbox.idtoken;


// Build Firebase credential with the Google ID token.
var credential = firebase.auth.GoogleAuthProvider.credential(idtoken);

// Sign in with credential from the Google user.
firebase.auth().signInWithCredential(credential).catch(function(error) {
  // Handle Errors here.
  var errorCode = error.code;
  var errorMessage = error.message;
  // The email of the user's account used.
  var email = error.email;
  // The firebase.auth.AuthCredential type that was used.
  var credential = error.credential;
  // ...
  console.log(error);
});




// // Create and Deploy Your First Cloud Functions
// // https://firebase.google.com/docs/functions/write-firebase-functions
//
// exports.helloWorld = functions.https.onRequest((request, response) => {
//  response.send("Hello from Firebase!");
// });


exports.events = functions.https.onRequest((request, response) => {

  const sig = request.headers['stripe-signature'];

  let event;

  try {
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
  // case 'charge.succeeded':
  //   const 
  // ... handle other event types
  default:
    console.log(event);
    // Unexpected event type
    // return response.status(400).end();
  }

  // Return a response to acknowledge receipt of the event
  return response.json({received: true, event});



  response.send("Endpoint for Stripe Webhooks!");
});
