const functions = require('firebase-functions');
const stripe = require('stripe')(functions.config().keys.webhooks);

const endpointSecret = functions.config().keys.signing;



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
    console.log('PaymentIntent was successful!')
    break;
  case 'payment_method.attached':
    const paymentMethod = event.data.object;
    console.log('PaymentMethod was attached to a Customer!')
    break;
  // ... handle other event types
  default:
    return response.json({received: true});
    // Unexpected event type
    // return response.status(400).end();
  }

  // Return a response to acknowledge receipt of the event
  return response.json({received: true});



  response.send("Endpoint for Stripe Webhooks!");
});
