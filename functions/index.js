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

let buyerId, groupId;





// Stripe Init
const stripe = require('stripe')(functions.config().keys.webhooks);

const endpointSecret = functions.config().keys.signing;




// SettleUp Init
// Firebase App (the core Firebase SDK) is always required and
// must be listed before other Firebase SDKs
const firebase = require("firebase/app");

// Add the Firebase products that you want to use
require("firebase/auth");

const firebaseConfig = {
  apiKey: functions.config().keys.settleup.sandbox.apikey,
  authDomain: `settle-up-${environment}.firebaseapp.com`,
  databaseURL: `https://settle-up-${environment}.firebaseio.com`,
  projectId: `settle-up-${environment}`,
  storageBucket: `settle-up-${environment}.appspot.com`,
};
firebase.initializeApp(firebaseConfig);

let user, idtoken;

// Initialize Firebase
async function initFirebase() {
  await firebase.auth().signInWithEmailAndPassword(
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
      return user; 
    } else {
      // No user is signed in.
      console.log('User is not signed in');
    }
  });
}

initFirebase();





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




function createTransactionFrom(stripeTrans) {
  return {
    'category': '🎟',
    'currencyCode': stripeTrans.currency.toUpperCase(),
    'dateTime': stripeTrans.created * 1000, // stripe measures in seconds, settleup in ms
    'items': [
      {
        'amount': '15.00',//(stripeTrans.amount / 100).toString(), // stripe measures in integers, settleup like normal ($15.00)
        'forWhom': [
          {
            'memberId': buyerId,
            'weight': '1',
          },
        ],
      },
    ],
    'purpose': 'Quota Associativa',
    'type': 'expense',
    'whoPaid': [
      {
        'memberId': buyerId,
        'weight': '1',
      },
    ],
  };
}


async function postTransaction(transaction) {
  url = `https://settle-up-${environment}.firebaseio.com/transactions/${groupId}.json?auth=${idtoken}`;
  try {
    const response = await axios.post(url, transaction);
    // const data = response.data;
    console.log(Object.keys(response));
    console.log(response);
    return response;
  } catch (error) {
    console.error(Object.keys(error.response));
    console.error(error.response);
    return null;
  }  
}

async function postMember(memberName) {
  url = `https://settle-up-${environment}.firebaseio.com/members/${groupId}.json?auth=${idtoken}`;
  const json = {
    'active': true,
    'defaultWeight': '1',
    'name': memberName
  }
  try {
    const response = await axios.post(url, json);
    const data = response.data;
    console.log(Object.keys(data));
    console.log(data);
    return data;
  } catch (error) {
    console.error(Object.keys(error.response));
    console.error(error.response);
    return null;
  }  
}



// // Create and Deploy Your First Cloud Functions
// // https://firebase.google.com/docs/functions/write-firebase-functions
//
// exports.helloWorld = functions.https.onRequest((request, response) => {
//  response.send("Hello from Firebase!");
// });


exports.events = functions.https.onRequest(async (request, response) => {
  user ||  await initFirebase();
  idtoken = await user.getIdToken();
  // user.getIdToken().then(function(realIdToken) {  // <------ Check this line
  //   idtoken = realIdToken
  //   console.log(realIdToken); // It shows the Firebase token now
  // });
  console.log(`idtoken: ${idtoken}`);

  // SettleUp Init
  // get the user groups
  const userGroups = await getUserGroups();
  // get the group id with name groupName, to use and add the transaction.
  groupId = await findGroupId(userGroups);

  const sig = request.headers['stripe-signature'];

  let event, settleUpTrans;

  try {
    // event is the stripe webhook, containing the transaction/user
    event = stripe.webhooks.constructEvent(request.rawBody, sig, endpointSecret);
  }
  catch (err) {
    response.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  console.log(event.type);
  console.log(event);
  

  // Return a response to acknowledge receipt of the event
  return response.json({received: true, event: event.type});



  response.send("Endpoint for Stripe Webhooks!");
});
