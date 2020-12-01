const functions = require('firebase-functions');
//Axios for web GET POST
const axios = require("axios");


let url;

// const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));


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
// the key will look something like rk_... or sk_... if you didn't dedicate a key to this integration
const stripe = require('stripe')(functions.config().keys.stripe[environment].apikey);

const endpointSecret = functions.config().keys.stripe[environment].webhook;




// SettleUp Init
// Firebase App (the core Firebase SDK) is always required and
// must be listed before other Firebase SDKs
const firebase = require("firebase/app");

// Add the Firebase products that you want to use
require("firebase/auth");

const firebaseConfig = {
  apiKey: functions.config().keys.settleup[environment].apikey,
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
    functions.config().keys.settleup.bot.email, 
    functions.config().keys.settleup.bot.password).catch(function(error) {
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


// limit stands for max length
// these are the limits of Settle Up
const LIMIT_MEMBER_NAME = 20;
const LIMIT_TX_NAME = 128;
// this means that after 99999 installments it might throw an error of max Tx length
const LIMIT_N_OF_INSTALLMENTS = 5;
const LIMIT_PROD_NAME = LIMIT_TX_NAME - 1 - LIMIT_N_OF_INSTALLMENTS - 1 - LIMIT_MEMBER_NAME;

function prepareForSettleUp_memberName(memberName) {
  if (memberName.length <= LIMIT_MEMBER_NAME) {
    return memberName;
  } else {
    console.error('memberName too long');
    console.error(memberName);
    console.error(memberName.substring(0, LIMIT_PROD_NAME - 2) + '..');
    return memberName.substring(0, LIMIT_MEMBER_NAME - 2) + '..';
  }
}

function prepareForSettleUp_prodName(prodName) {
  if (prodName.length <= LIMIT_PROD_NAME) {
    return prodName;
  } else {
    // this is the normal transaction on settle up.
    // the minus 2 is to substitute with '..' if the product name is too long
    // so for example "Product Name is very looooo.. 43210 Giovanni Pietro De.."
    console.error('prodName too long');
    console.error(prodName);
    console.error(prodName.substring(0, LIMIT_PROD_NAME - 2) + '..');
    return prodName.substring(0, LIMIT_PROD_NAME - 2) + '..';
  }
}


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
  console.error(`Group with name '${groupName}' not found!`);
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


async function putMemberActive(groupMembers, memberId, active=true) {
  url = `https://settle-up-${environment}.firebaseio.com/members/${groupId}.json?auth=${idtoken}`;
  const json = groupMembers;
  json[memberId].active = active;
  try {
    const response = await axios.put(url, json);
    const data = response.data;
    // console.log(Object.keys(response));
    console.log(data);
    return data;
  } catch (error) {
    console.error(error);
    return null;
  }
}


// this function also enables the member if disabled
async function findMemberId(memberName, createIfNotFound=false) {
  memberName = prepareForSettleUp_memberName(memberName);
  const groupMembers = await getGroupMembers();
  for (var memberId in groupMembers) {
    if (memberName == groupMembers[memberId].name) {
      const member = groupMembers[memberId];
      if (member.active == false) {
        await putMemberActive(groupMembers, memberId, active=true);
      }
      return memberId;
    }
  }
  if (createIfNotFound) {
    // retry with a delay once again, maybe the member was not added yet! (as it's the case in my testing)
    console.log(`Member '${memberName}' not found, creating him now on SettleUp!`);

    // returns the memberId
    return (await postMember(memberName)).name;
  }
  // we have tried to retry, friend :/
  console.error('Member not found!');
  return null;
}



function createIncomeTransactionTo(sellerId, currency, amount) {
  return {
    'category': '🎫',
    'currencyCode': currency.toUpperCase(),
    'dateTime': Date.now(), // settleup in ms just like Date.now()
    'fixedExchangeRate': true,
    'items': [
      {
        'amount': (-amount / 100).toString(), // stripe measures in cents (1500), settleup like normal ($15.00)
        'forWhom': [
          {
            'memberId': sellerId,
            'weight': '1',
          },
        ],
      },
    ],
    'purpose': 'Stripe Fee',
    'type': 'expense',
    'whoPaid': [
      {
        'memberId': sellerId,
        'weight': '1',
      },
    ],
  };
}



function createTransactionFrom(stripeTx, prodName, nOfInstallments) {
  var purpose = prepareForSettleUp_prodName(prodName) + ' ';
  if (nOfInstallments > 1) {
    purpose += nOfInstallments.toString() + ' ';
  }
  purpose += stripeTx.billing_details.name;
  console.log(purpose);
  return {
    'category': '🎫',
    'currencyCode': stripeTx.currency.toUpperCase(),
    'dateTime': stripeTx.created * 1000, // stripe measures in seconds, settleup in ms
    'fixedExchangeRate': true,
    'items': [
      {
        'amount': (stripeTx.amount / 100).toString(), // stripe measures in integers, settleup like normal ($15.00)
        'forWhom': [
          {
            'memberId': buyerId,
            'weight': '1',
          },
        ],
      },
    ],
    'purpose': purpose,
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

  let event, settleUpTx;

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
    // I commented it because while it works for ad-hoc requests, 
    // actually charge.succeded is called before customer.created,
    // so the function is executed in the wrong order this way
  // case 'customer.created': 
  //   // get the stripe customer
  //   const stripeCust = event.data.object;
  //   console.log(stripeCust);
  //   const memberId = (await postMember(stripeCust.email)).name;

  //   // Return a response to acknowledge receipt of the event
  //   return response.json({received: true, memberId: memberId});

  case 'charge.succeeded':
    
    // get the stripe transaction
    const stripeTx = event.data.object;
    console.log(stripeTx);
    // get the id of the buyer by matching the name with the name on Settle Up
    // this also activates the member if inactive
    buyerId = await findMemberId(stripeTx.billing_details.name, createIfNotFound=true);
    
    let nOfInstallments, product = {};
    if (stripeTx.invoice != null) {
      const invoice = await stripe.invoices.retrieve(stripeTx.invoice);
      const subId = invoice.subscription;
      // there could be multiple items in an invoice, not supported for now
      const prodId = invoice.lines.data[0].plan.product;
      const planId = invoice.lines.data[0].plan.id;
      const plan = await stripe.plans.retrieve(planId); 
      product = await stripe.products.retrieve(prodId);
      product.name += ' ' + plan.nickname;
      nOfInstallments = (await stripe.invoices.list({subscription: subId})).data
        .filter(installment => installment.status == 'paid')
        .length
      ;
    }
    else {
      product.name = stripeTx.description;
      nOfInstallments = 1;
    }
    settleUpTx = createTransactionFrom(stripeTx, product.name, nOfInstallments);
    console.log(settleUpTx);
    // post the transaction
    await postTransaction(settleUpTx);

    // disable the member as it's not going to be active for a while
    const groupMembers = await getGroupMembers();
    await putMemberActive(groupMembers, buyerId, active=false);

    // get the transaction id to fetch the fees
    const txId = stripeTx.balance_transaction;
    console.log(txId);
    
    
    const balanceTx = await stripe.balanceTransactions.retrieve(txId);
    const fee = balanceTx.fee;
    const currency = balanceTx.currency;
    console.log(fee);

    // check if the Stripe user is present in SettleUp, if not create it
    stripeUserId = await findMemberId('Stripe', createIfNotFound=true);

    // post the transaction to settle up (income mode missing)
    settleUpTx = createIncomeTransactionTo(stripeUserId, currency, fee);
    console.log(settleUpTx);
    await postTransaction(settleUpTx);
    
    
    

    // Return a response to acknowledge receipt of the event
    return response.json({received: true, fee: fee});

  // ... handle other event types
  default:
    console.log(event);

    // Unexpected event type
    // return response.status(400).end();
  }

  // Return a response to acknowledge receipt of the event
  return response.json({received: true});



  response.send("Endpoint for Stripe Webhooks!");
});
