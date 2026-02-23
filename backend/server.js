require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Initialize Supabase (use service role key for admin operations)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

// CORS configuration
app.use(cors());

// Stripe webhook endpoint - MUST be before body-parser
app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.error('⚠️  Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  console.log(`✅ Received event: ${event.type}`);

  switch (event.type) {
    case 'payment_intent.succeeded':
      const paymentIntent = event.data.object;
      await handlePaymentSuccess(paymentIntent);
      break;

    case 'payment_intent.payment_failed':
      const failedPayment = event.data.object;
      await handlePaymentFailure(failedPayment);
      break;

    case 'charge.succeeded':
      const charge = event.data.object;
      console.log('💰 Charge succeeded:', charge.id);
      break;

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  res.json({ received: true });
});

// Body parser for other routes
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    stripe: !!process.env.STRIPE_SECRET_KEY,
    supabase: !!process.env.SUPABASE_URL,
  });
});

// Create payment intent endpoint
app.post('/create-payment-intent', async (req, res) => {
  try {
    const { amount, currency = 'usd', metadata = {} } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency,
      metadata,
      automatic_payment_methods: {
        enabled: true,
      },
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });
  } catch (error) {
    console.error('Error creating payment intent:', error);
    res.status(500).json({ error: error.message });
  }
});

// Handle successful payment
async function handlePaymentSuccess(paymentIntent) {
  console.log('💳 Payment succeeded:', paymentIntent.id);

  const { userId, goalListId, participantId } = paymentIntent.metadata;

  if (!userId || !goalListId || !participantId) {
    console.error('Missing metadata in payment intent');
    return;
  }

  try {
    // Update participant payment status in Supabase
    const { error } = await supabase
      .from('group_goal_participants')
      .update({
        payment_status: 'paid',
        stripe_payment_intent_id: paymentIntent.id,
        paid_at: new Date().toISOString(),
      })
      .eq('id', participantId)
      .eq('user_id', userId);

    if (error) {
      console.error('Error updating participant:', error);
      return;
    }

    console.log('✅ Updated participant payment status');

    // Check if all participants have paid
    const { data: participants } = await supabase
      .from('group_goal_participants')
      .select('payment_status')
      .eq('goal_list_id', goalListId);

    const allPaid = participants?.every(p => p.payment_status === 'paid');

    if (allPaid) {
      // Update goal list to mark as started
      await supabase
        .from('goal_lists')
        .update({ all_paid: true })
        .eq('id', goalListId);

      console.log('🎉 All participants paid! Goal list started.');
    }
  } catch (err) {
    console.error('Error in handlePaymentSuccess:', err);
  }
}

// Handle failed payment
async function handlePaymentFailure(paymentIntent) {
  console.log('❌ Payment failed:', paymentIntent.id);

  const { userId, participantId } = paymentIntent.metadata;

  if (participantId) {
    try {
      await supabase
        .from('group_goal_participants')
        .update({
          payment_status: 'failed',
          stripe_payment_intent_id: paymentIntent.id,
        })
        .eq('id', participantId)
        .eq('user_id', userId);

      console.log('Updated participant with failed payment status');
    } catch (err) {
      console.error('Error updating failed payment:', err);
    }
  }
}

// ─────────────────────────────────────────────
//  STRIPE CONNECT  –  Express account creation
// ─────────────────────────────────────────────

// POST /create-connect-account
// Creates (or retrieves) a Stripe Express account for a winner.
// Body: { user_id, goal_list_id, return_url? }
app.post('/create-connect-account', async (req, res) => {
  try {
    const { user_id, goal_list_id, return_url } = req.body;
    if (!user_id || !goal_list_id) {
      return res.status(400).json({ error: 'user_id and goal_list_id are required' });
    }

    // Check DB for existing account
    const { data: existing } = await supabase
      .from('stripe_connect_accounts')
      .select('stripe_account_id, onboarding_completed')
      .eq('user_id', user_id)
      .maybeSingle();

    let stripeAccountId;

    if (existing) {
      stripeAccountId = existing.stripe_account_id;
      if (existing.onboarding_completed) {
        return res.json({ already_connected: true, stripe_account_id: stripeAccountId });
      }
    } else {
      const account = await stripe.accounts.create({
        type: 'express',
        metadata: { user_id, goal_list_id },
      });
      stripeAccountId = account.id;

      await supabase.from('stripe_connect_accounts').insert({
        user_id,
        stripe_account_id: stripeAccountId,
        onboarding_completed: false,
      });
    }

    const baseUrl = return_url || 'bttrtogetherapp://payout';
    const accountLink = await stripe.accountLinks.create({
      account:      stripeAccountId,
      refresh_url:  `${baseUrl}-refresh`,
      return_url:   `${baseUrl}-return`,
      type:         'account_onboarding',
    });

    res.json({ onboarding_url: accountLink.url, stripe_account_id: stripeAccountId });
  } catch (error) {
    console.error('Error creating connect account:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /check-connect-status
// Checks if a user's Stripe Express account has completed onboarding.
// Body: { user_id }
app.post('/check-connect-status', async (req, res) => {
  try {
    const { user_id } = req.body;
    if (!user_id) return res.status(400).json({ error: 'user_id is required' });

    const { data: connectRecord } = await supabase
      .from('stripe_connect_accounts')
      .select('stripe_account_id, onboarding_completed')
      .eq('user_id', user_id)
      .maybeSingle();

    if (!connectRecord) {
      return res.json({ onboarding_completed: false, has_account: false });
    }

    const account = await stripe.accounts.retrieve(connectRecord.stripe_account_id);
    const isComplete = account.charges_enabled && account.payouts_enabled;

    if (isComplete && !connectRecord.onboarding_completed) {
      await supabase
        .from('stripe_connect_accounts')
        .update({ onboarding_completed: true })
        .eq('user_id', user_id);
    }

    res.json({
      onboarding_completed: isComplete,
      has_account:          true,
      stripe_account_id:    connectRecord.stripe_account_id,
      charges_enabled:      account.charges_enabled,
      payouts_enabled:      account.payouts_enabled,
    });
  } catch (error) {
    console.error('Error checking connect status:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /process-winner-payout
// Transfers the prize pool from the platform account to the winner's
// Stripe Express connected account.
// Body: { goal_list_id, winner_id }
app.post('/process-winner-payout', async (req, res) => {
  try {
    const { goal_list_id, winner_id } = req.body;
    if (!goal_list_id || !winner_id) {
      return res.status(400).json({ error: 'goal_list_id and winner_id are required' });
    }

    // Fetch goal list
    const { data: goalList, error: glError } = await supabase
      .from('goal_lists')
      .select('id, winner_id, prize_pool_amount, platform_fee_amount, payout_status, name')
      .eq('id', goal_list_id)
      .single();

    if (glError || !goalList) {
      return res.status(404).json({ error: 'Goal list not found' });
    }
    if (goalList.winner_id !== winner_id) {
      return res.status(403).json({ error: 'User is not the declared winner' });
    }
    if (goalList.payout_status === 'completed') {
      return res.status(400).json({ error: 'Payout already completed' });
    }

    // Fetch winner's Connect account
    const { data: connectRecord } = await supabase
      .from('stripe_connect_accounts')
      .select('stripe_account_id, onboarding_completed')
      .eq('user_id', winner_id)
      .maybeSingle();

    if (!connectRecord) {
      return res.status(400).json({ error: 'No Stripe account found. Complete onboarding first.' });
    }

    // Verify with Stripe
    const account = await stripe.accounts.retrieve(connectRecord.stripe_account_id);
    if (!account.charges_enabled || !account.payouts_enabled) {
      return res.status(400).json({ error: 'Stripe account onboarding is not complete' });
    }

    const prizeAmount = goalList.prize_pool_amount;
    if (!prizeAmount || prizeAmount <= 0) {
      return res.status(400).json({ error: 'No prize pool to transfer' });
    }

    // Transfer prize pool to winner's connected account
    const transfer = await stripe.transfers.create({
      amount:      Math.round(prizeAmount * 100), // cents
      currency:    'usd',
      destination: connectRecord.stripe_account_id,
      metadata: {
        goal_list_id,
        winner_id,
        description: `Prize payout for: ${goalList.name}`,
      },
    });

    // Record payout in DB
    await supabase.from('payouts').insert({
      goal_list_id,
      winner_id,
      total_amount:              (goalList.prize_pool_amount || 0) + (goalList.platform_fee_amount || 0),
      payout_amount:             prizeAmount,
      stripe_transfer_id:        transfer.id,
      stripe_connect_account_id: connectRecord.stripe_account_id,
      status:                    'processing',
    });

    // Update goal list
    await supabase
      .from('goal_lists')
      .update({ payout_status: 'processing' })
      .eq('id', goal_list_id);

    res.json({ success: true, transfer_id: transfer.id, amount: prizeAmount });
  } catch (error) {
    console.error('Error processing winner payout:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────
//  DECLARE WINNER  (admin / owner action)
// ─────────────────────────────────────────────

// POST /declare-winner
// Goal list owner declares the winner. Updates goal_lists.winner_id.
// Body: { goal_list_id, owner_id, winner_id }
app.post('/declare-winner', async (req, res) => {
  try {
    const { goal_list_id, owner_id, winner_id } = req.body;
    if (!goal_list_id || !owner_id || !winner_id) {
      return res.status(400).json({ error: 'goal_list_id, owner_id, and winner_id are required' });
    }

    // Verify the caller is the goal list owner
    const { data: goalList } = await supabase
      .from('goal_lists')
      .select('user_id, winner_id')
      .eq('id', goal_list_id)
      .single();

    if (!goalList) return res.status(404).json({ error: 'Goal list not found' });
    if (goalList.user_id !== owner_id) {
      return res.status(403).json({ error: 'Only the goal list owner can declare a winner' });
    }
    if (goalList.winner_id) {
      return res.status(400).json({ error: 'A winner has already been declared' });
    }

    await supabase
      .from('goal_lists')
      .update({ winner_id })
      .eq('id', goal_list_id);

    res.json({ success: true });
  } catch (error) {
    console.error('Error declaring winner:', error);
    res.status(500).json({ error: error.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Bttr Together Backend running on port ${PORT}`);
  console.log(`📍 Webhook endpoint: http://localhost:${PORT}/webhook`);
  console.log(`🏥 Health check: http://localhost:${PORT}/health`);
  
  if (!process.env.STRIPE_SECRET_KEY) {
    console.warn('⚠️  WARNING: STRIPE_SECRET_KEY not set!');
  }
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    console.warn('⚠️  WARNING: STRIPE_WEBHOOK_SECRET not set!');
  }
});
